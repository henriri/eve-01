// ─── particles.ts — morph-points branch ──────────────────────────
// The SAME Points object from torus.ts morphs into terrain.
// 3072 torus points → 3072 terrain target positions (subset of 70×70 grid)
// Extra terrain density (remaining ~1828 points) fades in as second object.

import * as THREE from 'three'
import {
  posAttr, restPositions, currentPositions,
  getScene, getCamera,
  setSpinning, snapToRest,
  TORUS_COUNT,
} from './torus'

const COLS = 70
const ROWS = 70
const TOTAL_TERRAIN = COLS * ROWS   // 4900

const CAM_TORUS   = new THREE.Vector3(0,   0, 5)
const CAM_TERRAIN = new THREE.Vector3(0, 3.5, 7)
const CAM_TARGET  = new THREE.Vector3(0,   0, 0)

// ── terrain elevation shader (per-point size by Y) ────────────────
const VERT_EXTRA = `
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
const FRAG_EXTRA = `
  uniform float uOpacity;
  void main() {
    if (length(gl_PointCoord - vec2(0.5)) > 0.5) discard;
    gl_FragColor = vec4(0.949, 0.941, 0.910, uOpacity);
  }
`

// terrain data
let staticY:         Float32Array
let terrainTargets:  Float32Array   // 3072 positions (morph targets for torus points)
let extraPoints:     THREE.Points | null = null
let extraMat:        THREE.ShaderMaterial | null = null
let extraAttr:       THREE.BufferAttribute
let extraStaticY:    Float32Array

let terrainVisible  = false
let morphing        = false
let terrainAnimId:  number
let startTime:      number

// ── helpers ───────────────────────────────────────────────────────
function lerpCamera(from: THREE.Vector3, to: THREE.Vector3, dur: number): Promise<void> {
  return new Promise(resolve => {
    const cam = getCamera(), start = performance.now(), orig = from.clone()
    function step() {
      const p  = Math.min((performance.now() - start) / dur, 1)
      const ep = 1 - Math.pow(1 - p, 3)
      cam.position.lerpVectors(orig, to, ep)
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

// ── grid sizing (v5 formula) ──────────────────────────────────────
function computeSpacing() {
  const cam = getCamera()
  const fovRad  = (cam.fov * Math.PI) / 180
  const camDist = CAM_TERRAIN.z
  const camH    = CAM_TERRAIN.y
  const visibleW  = 2 * Math.tan(fovRad / 2) * camDist * cam.aspect
  const spacingX  = (visibleW * 1.2) / (COLS - 1)
  const tiltAngle = Math.atan2(camH, camDist)
  const halfFovV  = fovRad / 2
  const farZ      = camH / Math.tan(Math.max(tiltAngle + halfFovV, 0.05)) * 1.3
  const nearZ     = camH / Math.tan(Math.max(tiltAngle - halfFovV, 0.05)) * 0.5
  const spacingZ  = (farZ + nearZ) / (ROWS - 1)
  return { spacingX, spacingZ, offsetX: (COLS-1)*spacingX*0.5, offsetZ: nearZ }
}

// ── build all terrain positions ───────────────────────────────────
function buildTerrainData() {
  const { spacingX, spacingZ, offsetX, offsetZ } = computeSpacing()
  const allPos = new Float32Array(TOTAL_TERRAIN * 3)
  staticY      = new Float32Array(TOTAL_TERRAIN)

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
      const sy  =
        Math.sin(wx * 2.1 + rand() * 2) * 0.40 +
        Math.sin(wz * 1.7 + rand() * 2) * 0.30 +
        (rand() - 0.5) * 0.14
      staticY[idx]        = sy
      allPos[idx * 3]     = wx
      allPos[idx * 3 + 1] = sy
      allPos[idx * 3 + 2] = wz
    }
  }

  // shuffle indices to get a good spatial distribution for morph targets
  const indices = Array.from({ length: TOTAL_TERRAIN }, (_, i) => i)
  for (let i = indices.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [indices[i], indices[j]] = [indices[j], indices[i]]
  }

  // first TORUS_COUNT indices = morph targets for the torus points
  terrainTargets = new Float32Array(TORUS_COUNT * 3)
  for (let i = 0; i < TORUS_COUNT; i++) {
    const ti = indices[i]
    terrainTargets[i * 3]     = allPos[ti * 3]
    terrainTargets[i * 3 + 1] = allPos[ti * 3 + 1]
    terrainTargets[i * 3 + 2] = allPos[ti * 3 + 2]
  }

  // remaining indices = extra density layer
  const extraCount = TOTAL_TERRAIN - TORUS_COUNT
  const extraPos   = new Float32Array(extraCount * 3)
  extraStaticY     = new Float32Array(extraCount)
  for (let i = 0; i < extraCount; i++) {
    const ti = indices[TORUS_COUNT + i]
    extraPos[i * 3]     = allPos[ti * 3]
    extraPos[i * 3 + 1] = allPos[ti * 3 + 1]
    extraPos[i * 3 + 2] = allPos[ti * 3 + 2]
    extraStaticY[i]     = staticY[ti]
  }

  // build extra Points object
  if (extraPoints) { getScene().remove(extraPoints); extraPoints.geometry.dispose() }
  const geo = new THREE.BufferGeometry()
  extraAttr = new THREE.BufferAttribute(extraPos, 3)
  extraAttr.setUsage(THREE.DynamicDrawUsage)
  geo.setAttribute('position', extraAttr)
  extraMat = new THREE.ShaderMaterial({
    uniforms: { uOpacity: { value: 0 }, uBaseSize: { value: 8 }, uPixelRatio: { value: Math.min(window.devicePixelRatio, 2) } },
    vertexShader: VERT_EXTRA, fragmentShader: FRAG_EXTRA, transparent: true,
  })
  extraPoints = new THREE.Points(geo, extraMat)
  getScene().add(extraPoints)
}

// ── terrain wave tick ─────────────────────────────────────────────
function tickTerrain() {
  if (!terrainVisible || morphing) return
  const t = (performance.now() - startTime) / 1000

  // update main points (torus points now at terrain positions)
  for (let i = 0; i < TORUS_COUNT; i++) {
    const tx = terrainTargets[i * 3]
    const tz = terrainTargets[i * 3 + 2]
    const dy =
      Math.sin(tx * 1.2 + t * 0.55) * 0.18 +
      Math.sin(tz * 0.9 + t * 0.45) * 0.14 +
      Math.sin((tx + tz) * 0.6 + t * 0.30) * 0.07
    posAttr.array[i * 3 + 1] = terrainTargets[i * 3 + 1] + dy
  }
  posAttr.needsUpdate = true

  // update extra points
  const extraCount = extraStaticY.length
  for (let i = 0; i < extraCount; i++) {
    const tx = extraAttr.array[i * 3]
    const tz = extraAttr.array[i * 3 + 2]
    const dy =
      Math.sin(tx * 1.2 + t * 0.55) * 0.18 +
      Math.sin(tz * 0.9 + t * 0.45) * 0.14 +
      Math.sin((tx + tz) * 0.6 + t * 0.30) * 0.07
    extraAttr.array[i * 3 + 1] = extraStaticY[i] + dy
  }
  extraAttr.needsUpdate = true

  terrainAnimId = requestAnimationFrame(tickTerrain)
}

// ── morph torus → terrain ─────────────────────────────────────────
function morphToTerrain(): Promise<void> {
  return new Promise(resolve => {
    morphing = true
    const duration = 1200
    const start    = performance.now()

    // snapshot starting positions
    const from = currentPositions.slice()

    function step() {
      const p  = Math.min((performance.now() - start) / duration, 1)
      const ep = 1 - Math.pow(1 - p, 3)  // ease-out cubic

      for (let i = 0; i < TORUS_COUNT; i++) {
        const ri = i * 3
        posAttr.array[ri]     = from[ri]     + (terrainTargets[ri]     - from[ri])     * ep
        posAttr.array[ri + 1] = from[ri + 1] + (terrainTargets[ri + 1] - from[ri + 1]) * ep
        posAttr.array[ri + 2] = from[ri + 2] + (terrainTargets[ri + 2] - from[ri + 2]) * ep
      }
      posAttr.needsUpdate = true

      if (p < 1) requestAnimationFrame(step)
      else { morphing = false; resolve() }
    }
    step()
  })
}

// ── morph terrain → torus ─────────────────────────────────────────
function morphToTorus(): Promise<void> {
  return new Promise(resolve => {
    morphing = true
    const duration = 1100
    const start    = performance.now()

    // snapshot current terrain positions
    const from = new Float32Array(TORUS_COUNT * 3)
    for (let i = 0; i < TORUS_COUNT * 3; i++) from[i] = posAttr.array[i]

    function step() {
      const p  = Math.min((performance.now() - start) / duration, 1)
      const ep = 1 - Math.pow(1 - p, 3)

      for (let i = 0; i < TORUS_COUNT; i++) {
        const ri = i * 3
        posAttr.array[ri]     = from[ri]     + (restPositions[ri]     - from[ri])     * ep
        posAttr.array[ri + 1] = from[ri + 1] + (restPositions[ri + 1] - from[ri + 1]) * ep
        posAttr.array[ri + 2] = from[ri + 2] + (restPositions[ri + 2] - from[ri + 2]) * ep
      }
      posAttr.needsUpdate = true

      if (p < 1) requestAnimationFrame(step)
      else { morphing = false; snapToRest(); resolve() }
    }
    step()
  })
}

// ── public API ────────────────────────────────────────────────────
export async function explodeTorus() {
  setSpinning(false)
  buildTerrainData()

  lerpCamera(CAM_TORUS, CAM_TERRAIN, 1100)
  await morphToTerrain()

  terrainVisible = true
  startTime = performance.now()

  fadeExtra(0, 0.88, 600)
  tickTerrain()
}

export async function dissolveTerrain() {
  if (!terrainVisible) return
  terrainVisible = false
  cancelAnimationFrame(terrainAnimId)

  fadeExtra(0.88, 0, 500)
  lerpCamera(CAM_TERRAIN, CAM_TORUS, 1100)
  await morphToTorus()

  setSpinning(true)
}
