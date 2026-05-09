// ─── particles.ts — morph-linesegments branch ────────────────────
// Open:  segments collapse → midpoints travel to terrain → wave starts
// Close: wave stops → midpoints converge back → segments expand

import * as THREE from 'three'
import {
  midPosAttr, restMids,
  getScene, getCamera,
  collapseSegments, expandSegments,
  TORUS_COUNT,
} from './torus'

const COLS = 70
const ROWS = 70
const EXTRA_COUNT = COLS * ROWS - TORUS_COUNT

const CAM_TORUS   = new THREE.Vector3(0,   0, 5)
const CAM_TERRAIN = new THREE.Vector3(0, 3.5, 7)
const CAM_TARGET  = new THREE.Vector3(0,   0, 0)

// extra density shader
const VERT_EXTRA = `
  uniform float uBaseSize; uniform float uPixelRatio;
  void main() {
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    float t = clamp((position.y + 0.8) / 1.6, 0.0, 1.0);
    gl_PointSize = mix(1.5, 5.0, t) * uBaseSize * uPixelRatio * (1.0 / -mvPosition.z);
    gl_Position  = projectionMatrix * mvPosition;
  }
`
const FRAG_EXTRA = `
  uniform float uOpacity;
  void main() {
    if (length(gl_PointCoord - vec2(0.5)) > 0.5) discard;
    gl_FragColor = vec4(0.949, 0.941, 0.910, uOpacity);
  }
`

let terrainTargets: Float32Array
let extraPoints:    THREE.Points | null = null
let extraMat:       THREE.ShaderMaterial | null = null
let extraAttr:      THREE.BufferAttribute
let extraStaticY:   Float32Array
let mainStaticY:    Float32Array

let terrainVisible = false
let terrainAnimId: number
let startTime:     number

function lerpCamera(from: THREE.Vector3, to: THREE.Vector3, dur: number): Promise<void> {
  return new Promise(resolve => {
    const cam = getCamera(), start = performance.now(), orig = from.clone()
    function step() {
      const p = Math.min((performance.now() - start) / dur, 1)
      cam.position.lerpVectors(orig, to, 1 - Math.pow(1 - p, 3))
      cam.lookAt(CAM_TARGET)
      if (p < 1) requestAnimationFrame(step); else resolve()
    }
    step()
  })
}

function fadeExtra(from: number, to: number, dur: number): Promise<void> {
  return new Promise(resolve => {
    if (!extraMat) { resolve(); return }
    const start = performance.now()
    function step() {
      const p = Math.min((performance.now() - start) / dur, 1)
      extraMat!.uniforms.uOpacity.value = from + (to - from) * p
      if (p < 1) requestAnimationFrame(step); else resolve()
    }
    step()
  })
}

function computeSpacing() {
  const cam = getCamera()
  const fovRad = (cam.fov * Math.PI) / 180
  const camDist = CAM_TERRAIN.z, camH = CAM_TERRAIN.y
  const visibleW = 2 * Math.tan(fovRad / 2) * camDist * cam.aspect
  const spacingX = (visibleW * 1.2) / (COLS - 1)
  const tiltAngle = Math.atan2(camH, camDist), halfFovV = fovRad / 2
  const farZ  = camH / Math.tan(Math.max(tiltAngle + halfFovV, 0.05)) * 1.3
  const nearZ = camH / Math.tan(Math.max(tiltAngle - halfFovV, 0.05)) * 0.5
  return { spacingX, spacingZ: (farZ + nearZ) / (ROWS - 1), offsetX: (COLS-1)*spacingX*0.5, offsetZ: nearZ }
}

function buildTerrainData() {
  const { spacingX, spacingZ, offsetX, offsetZ } = computeSpacing()
  const allPos = new Float32Array(COLS * ROWS * 3)
  const allStaticY = new Float32Array(COLS * ROWS)

  let seed = 42
  const rand = () => { seed=(seed*1664525+1013904223)&0xffffffff; return (seed>>>0)/0xffffffff }

  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const idx = r * COLS + c
      const wx  =  c * spacingX - offsetX
      const wz  = -r * spacingZ + offsetZ
      const sy  = Math.sin(wx*2.1+rand()*2)*0.40 + Math.sin(wz*1.7+rand()*2)*0.30 + (rand()-0.5)*0.14
      allStaticY[idx] = sy
      allPos[idx*3] = wx; allPos[idx*3+1] = sy; allPos[idx*3+2] = wz
    }
  }

  // shuffle for even distribution
  const indices = Array.from({length: COLS*ROWS}, (_,i) => i)
  for (let i=indices.length-1;i>0;i--) { const j=Math.floor(Math.random()*(i+1));[indices[i],indices[j]]=[indices[j],indices[i]] }

  terrainTargets = new Float32Array(TORUS_COUNT * 3)
  mainStaticY    = new Float32Array(TORUS_COUNT)
  for (let i=0;i<TORUS_COUNT;i++) {
    const ti = indices[i]
    terrainTargets[i*3]   = allPos[ti*3]
    terrainTargets[i*3+1] = allPos[ti*3+1]
    terrainTargets[i*3+2] = allPos[ti*3+2]
    mainStaticY[i]        = allStaticY[ti]
  }

  const extraPos = new Float32Array(EXTRA_COUNT * 3)
  extraStaticY   = new Float32Array(EXTRA_COUNT)
  for (let i=0;i<EXTRA_COUNT;i++) {
    const ti = indices[TORUS_COUNT+i]
    extraPos[i*3]   = allPos[ti*3]; extraPos[i*3+1] = allPos[ti*3+1]; extraPos[i*3+2] = allPos[ti*3+2]
    extraStaticY[i] = allStaticY[ti]
  }

  if (extraPoints) { getScene().remove(extraPoints); extraPoints.geometry.dispose() }
  const geo = new THREE.BufferGeometry()
  extraAttr = new THREE.BufferAttribute(extraPos, 3)
  extraAttr.setUsage(THREE.DynamicDrawUsage)
  geo.setAttribute('position', extraAttr)
  extraMat = new THREE.ShaderMaterial({
    uniforms: { uOpacity:{value:0}, uBaseSize:{value:6}, uPixelRatio:{value:Math.min(devicePixelRatio,2)} },
    vertexShader: VERT_EXTRA, fragmentShader: FRAG_EXTRA, transparent: true,
  })
  extraPoints = new THREE.Points(geo, extraMat)
  getScene().add(extraPoints)
}

// morph midpoints → terrain targets
function morphMidsToTerrain(): Promise<void> {
  return new Promise(resolve => {
    const start = performance.now(), dur = 1000
    const from  = midPosAttr.array.slice() as Float32Array
    function step() {
      const p  = Math.min((performance.now()-start)/dur, 1)
      const ep = 1 - Math.pow(1-p, 3)
      for (let i=0;i<TORUS_COUNT*3;i++) {
        midPosAttr.array[i] = from[i] + (terrainTargets[i] - from[i]) * ep
      }
      midPosAttr.needsUpdate = true
      if (p < 1) requestAnimationFrame(step); else resolve()
    }
    step()
  })
}

// morph midpoints back → rest mids (torus shape)
function morphMidsToTorus(): Promise<void> {
  return new Promise(resolve => {
    const start = performance.now(), dur = 950
    const from  = midPosAttr.array.slice() as Float32Array
    function step() {
      const p  = Math.min((performance.now()-start)/dur, 1)
      const ep = 1 - Math.pow(1-p, 3)
      for (let i=0;i<TORUS_COUNT*3;i++) {
        midPosAttr.array[i] = from[i] + (restMids[i] - from[i]) * ep
      }
      midPosAttr.needsUpdate = true
      if (p < 1) requestAnimationFrame(step); else resolve()
    }
    step()
  })
}

function tickTerrain() {
  if (!terrainVisible) return
  const t = (performance.now() - startTime) / 1000

  for (let i=0;i<TORUS_COUNT;i++) {
    const tx=terrainTargets[i*3], tz=terrainTargets[i*3+2]
    const dy = Math.sin(tx*1.2+t*0.55)*0.18 + Math.sin(tz*0.9+t*0.45)*0.14 + Math.sin((tx+tz)*0.6+t*0.30)*0.07
    midPosAttr.array[i*3+1] = mainStaticY[i] + dy
  }
  midPosAttr.needsUpdate = true

  for (let i=0;i<EXTRA_COUNT;i++) {
    const tx=extraAttr.array[i*3], tz=extraAttr.array[i*3+2]
    const dy = Math.sin(tx*1.2+t*0.55)*0.18 + Math.sin(tz*0.9+t*0.45)*0.14 + Math.sin((tx+tz)*0.6+t*0.30)*0.07
    extraAttr.array[i*3+1] = extraStaticY[i] + dy
  }
  extraAttr.needsUpdate = true

  terrainAnimId = requestAnimationFrame(tickTerrain)
}

export async function explodeTorus() {
  buildTerrainData()
  // collapse segments to points simultaneously with camera dolly
  lerpCamera(CAM_TORUS, CAM_TERRAIN, 1100)
  await collapseSegments()
  // now midpoints travel to terrain positions
  await morphMidsToTerrain()
  terrainVisible = true
  startTime = performance.now()
  tickTerrain()
  fadeExtra(0, 0.88, 600)
}

export async function dissolveTerrain() {
  if (!terrainVisible) return
  terrainVisible = false
  cancelAnimationFrame(terrainAnimId)
  fadeExtra(0.88, 0, 450)
  lerpCamera(CAM_TERRAIN, CAM_TORUS, 1100)
  // midpoints converge back to torus shape
  await morphMidsToTorus()
  // then segments expand back
  await expandSegments()
}
