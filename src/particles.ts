// ─── particles.ts v6 ─────────────────────────────────────────────
// - Keeps v5 terrain: bleed fix, dot-scale shader, slow waves
// - Open:  torus breaks (dots scatter) → terrain rises
// - Close: terrain dissolves → torus dots converge back

import * as THREE from 'three'
import {
  animateTorusBreak,
  animateTorusMerge,
  getTorusPositions,
  getScene,
  getCamera,
} from './torus'

const COLS = 70
const ROWS = 120

const CAM_TORUS   = new THREE.Vector3(0,   0, 5)
const CAM_TERRAIN = new THREE.Vector3(0, 3.5, 7)
const CAM_TARGET  = new THREE.Vector3(0,   0, 0)

// ── shader: per-point size by Y height ───────────────────────────
const VERT_SHADER = `
  uniform float uBaseSize;
  uniform float uPixelRatio;

  void main() {
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    float t    = clamp((position.y + 0.8) / 1.6, 0.0, 1.0);
    float size = mix(1.5, 5.0, t);
    gl_PointSize = size * uBaseSize * uPixelRatio * (1.0 / -mvPosition.z);
    gl_Position  = projectionMatrix * mvPosition;
  }
`
const FRAG_SHADER = `
  uniform float uOpacity;
  void main() {
    vec2 uv = gl_PointCoord - vec2(0.5);
    if (length(uv) > 0.5) discard;
    gl_FragColor = vec4(0.949, 0.941, 0.910, uOpacity);
  }
`

let pointsObj:     THREE.Points | null = null
let posAttr:       THREE.BufferAttribute
let staticY:       Float32Array
let shaderMat:     THREE.ShaderMaterial | null = null
let terrainActive  = false
let terrainVisible = false
let animFrameId:   number
let startTime:     number

// ── helpers ───────────────────────────────────────────────────────
function lerpCamera(from: THREE.Vector3, to: THREE.Vector3, duration: number): Promise<void> {
  return new Promise((resolve) => {
    const cam   = getCamera()
    const start = performance.now()
    const orig  = from.clone()
    function step() {
      const p  = Math.min((performance.now() - start) / duration, 1)
      const ep = 1 - Math.pow(1 - p, 3)
      cam.position.lerpVectors(orig, to, ep)
      cam.lookAt(CAM_TARGET)
      if (p < 1) requestAnimationFrame(step)
      else resolve()
    }
    step()
  })
}

function fadePoints(from: number, to: number, duration: number): Promise<void> {
  return new Promise((resolve) => {
    if (!shaderMat) { resolve(); return }
    const start = performance.now()
    function step() {
      const p = Math.min((performance.now() - start) / duration, 1)
      shaderMat!.uniforms.uOpacity.value = from + (to - from) * p
      if (p < 1) requestAnimationFrame(step)
      else resolve()
    }
    step()
  })
}

// ── full-bleed grid sizing (v5 formula, preserved) ─────────────────
function computeSpacing() {
  const cam     = getCamera()
  const fovRad  = (cam.fov * Math.PI) / 180
  const camDist = CAM_TERRAIN.z
  const camH    = CAM_TERRAIN.y

  const visibleW  = 2 * Math.tan(fovRad / 2) * camDist * cam.aspect
  const spacingX  = (visibleW * 1.2) / (COLS - 1)

  const tiltAngle = Math.atan2(camH, camDist)
  const halfFovV  = fovRad / 2
  const farAngle  = tiltAngle + halfFovV
  const nearAngle = tiltAngle - halfFovV
  const farZ      = camH / Math.tan(Math.max(farAngle,  0.05)) * 1.3
  const nearZ     = camH / Math.tan(Math.max(nearAngle, 0.05)) * 0.5
  const spacingZ  = (farZ + nearZ) / (ROWS - 1)
  const offsetX   = (COLS - 1) * spacingX * 0.5
  const offsetZ   = nearZ

  return { spacingX, spacingZ, offsetX, offsetZ }
}

// ── build terrain (v5, preserved) ────────────────────────────────
function buildTerrain() {
  const count = COLS * ROWS
  const { spacingX, spacingZ, offsetX, offsetZ } = computeSpacing()

  const posArr = new Float32Array(count * 3)
  staticY      = new Float32Array(count)

  let seed = 42
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) & 0xffffffff
    return (seed >>> 0) / 0xffffffff
  }

  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const idx = r * COLS + c
      const wx  =  c * spacingX - offsetX
      const wz  = -r * spacingZ + offsetZ

      const sy =
        Math.sin(wx * 2.1 + rand() * 2) * 0.40 +
        Math.sin(wz * 1.7 + rand() * 2) * 0.30 +
        (rand() - 0.5)                  * 0.14

      staticY[idx]        = sy
      posArr[idx * 3]     = wx
      posArr[idx * 3 + 1] = sy
      posArr[idx * 3 + 2] = wz
    }
  }

  if (pointsObj) {
    getScene().remove(pointsObj)
    pointsObj.geometry.dispose()
  }

  const geo = new THREE.BufferGeometry()
  posAttr   = new THREE.BufferAttribute(posArr, 3)
  posAttr.setUsage(THREE.DynamicDrawUsage)
  geo.setAttribute('position', posAttr)

  shaderMat = new THREE.ShaderMaterial({
    uniforms: {
      uOpacity:    { value: 0 },
      uBaseSize:   { value: 30 },
      uPixelRatio: { value: Math.min(window.devicePixelRatio, 2) },
    },
    vertexShader:   VERT_SHADER,
    fragmentShader: FRAG_SHADER,
    transparent:    true,
  })

  pointsObj = new THREE.Points(geo, shaderMat)
  getScene().add(pointsObj)
}

// ── terrain tick (v5, slower waves preserved) ─────────────────────
function tickTerrain() {
  if (!terrainActive || !pointsObj) return

  const t = (performance.now() - startTime) / 1000
  const { spacingX, spacingZ, offsetX, offsetZ } = computeSpacing()

  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const idx = r * COLS + c
      const wx  =  c * spacingX - offsetX
      const wz  = -r * spacingZ + offsetZ

      const dy =
        Math.sin(wx * 1.2 + t * 0.55) * 0.18 +
        Math.sin(wz * 0.9 + t * 0.45) * 0.14 +
        Math.sin((wx + wz) * 0.6 + t * 0.30) * 0.07

      posAttr.array[idx * 3 + 1] = staticY[idx] + dy
    }
  }

  posAttr.needsUpdate = true
  animFrameId = requestAnimationFrame(tickTerrain)
}

// ── public API ────────────────────────────────────────────────────
export async function explodeTorus() {
  // 1. torus dots scatter outward (breaks apart)
  animateTorusBreak()

  // 2. build terrain, start camera dolly simultaneously
  buildTerrain()
  lerpCamera(CAM_TORUS, CAM_TERRAIN, 1000)

  // 3. short pause then terrain rises in
  await delay(400)
  terrainActive  = true
  terrainVisible = true
  startTime      = performance.now()
  tickTerrain()
  await fadePoints(0, 0.88, 700)
}

export async function dissolveTerrain() {
  if (!terrainVisible) return

  // 1. fade terrain out
  await fadePoints(0.88, 0, 450)
  terrainActive = false
  cancelAnimationFrame(animFrameId)

  // 2. camera dolly back
  lerpCamera(CAM_TERRAIN, CAM_TORUS, 900)

  // 3. sample a subset of terrain positions to seed the merge-back anim
  // use torus rest positions as targets — animateTorusMerge handles the lerp
  const torusPositions = getTorusPositions()
  const count          = torusPositions.length / 3

  // scatter origin: pick count random positions from current terrain
  const terrainCount = COLS * ROWS
  const fromPos      = new Float32Array(count * 3)
  for (let i = 0; i < count; i++) {
    const ti = Math.floor(Math.random() * terrainCount)
    fromPos[i * 3]     = posAttr.array[ti * 3]
    fromPos[i * 3 + 1] = posAttr.array[ti * 3 + 1]
    fromPos[i * 3 + 2] = posAttr.array[ti * 3 + 2]
  }

  // 4. torus dots converge from terrain surface back into ring shape
  await delay(200)
  animateTorusMerge(fromPos)

  terrainVisible = false
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}
