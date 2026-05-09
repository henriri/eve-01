// ─── particles.ts v3 ─────────────────────────────────────────────
// Dot terrain: NxN grid, sine-wave Y displacement, perpetual loop
// On open:  torus fades → camera dollies to terrain angle → terrain fades in
// On close: terrain fades out → camera dollies back → torus reveals

import * as THREE from 'three'
import { fadeTorus, revealTorus, getScene, getCamera } from './torus'

// ── grid config ──────────────────────────────────────────────────
const COLS    = 60
const ROWS    = 60
const SPACING = 0.18        // world units between points
const COUNT   = COLS * ROWS

// ── camera positions ─────────────────────────────────────────────
const CAM_TORUS   = new THREE.Vector3(0, 0,   5)    // default torus view
const CAM_TERRAIN = new THREE.Vector3(0, 3.5, 7)    // low horizon terrain view
const CAM_TARGET  = new THREE.Vector3(0, 0,   0)

// ── state ─────────────────────────────────────────────────────────
let pointsObj:  THREE.Points | null = null
let posAttr:    THREE.BufferAttribute
let terrainActive  = false
let terrainVisible = false
let animFrameId:   number
let startTime:     number

// ── helpers ───────────────────────────────────────────────────────

function lerpCamera(
  from: THREE.Vector3,
  to:   THREE.Vector3,
  duration: number
): Promise<void> {
  return new Promise((resolve) => {
    const cam   = getCamera()
    const start = performance.now()
    const orig  = from.clone()

    function step() {
      const p = Math.min((performance.now() - start) / duration, 1)
      const ep = 1 - Math.pow(1 - p, 3) // ease-out cubic
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
    if (!pointsObj) { resolve(); return }
    const mat   = pointsObj.material as THREE.PointsMaterial
    const start = performance.now()

    function step() {
      const p = Math.min((performance.now() - start) / duration, 1)
      mat.opacity = from + (to - from) * p
      if (p < 1) requestAnimationFrame(step)
      else resolve()
    }
    step()
  })
}

// ── build terrain grid ────────────────────────────────────────────

function buildTerrain() {
  const posArr = new Float32Array(COUNT * 3)

  const offsetX = (COLS - 1) * SPACING * 0.5
  const offsetZ = (ROWS - 1) * SPACING * 0.5

  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const i = (r * COLS + c) * 3
      posArr[i]     = c * SPACING - offsetX  // X
      posArr[i + 1] = 0                       // Y — driven by sine each frame
      posArr[i + 2] = r * SPACING - offsetZ  // Z
    }
  }

  const geo = new THREE.BufferGeometry()
  posAttr   = new THREE.BufferAttribute(posArr, 3)
  posAttr.setUsage(THREE.DynamicDrawUsage)
  geo.setAttribute('position', posAttr)

  const mat = new THREE.PointsMaterial({
    color:       0xf2f0e8,
    size:        0.018,
    transparent: true,
    opacity:     0,
    sizeAttenuation: true,
  })

  pointsObj = new THREE.Points(geo, mat)
  getScene().add(pointsObj)
}

// ── terrain animation loop ────────────────────────────────────────

function tickTerrain() {
  if (!terrainActive || !pointsObj) return

  const t = (performance.now() - startTime) / 1000

  const offsetX = (COLS - 1) * SPACING * 0.5
  const offsetZ = (ROWS - 1) * SPACING * 0.5

  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const i  = (r * COLS + c) * 3
      const wx = c * SPACING - offsetX
      const wz = r * SPACING - offsetZ

      // two overlapping sine waves — terrain ridges
      const y =
        Math.sin(wx * 1.2 + t * 1.4) * 0.35 +
        Math.sin(wz * 0.9 + t * 1.1) * 0.25 +
        Math.sin((wx + wz) * 0.6 + t * 0.8) * 0.12

      posAttr.array[i + 1] = y
    }
  }

  posAttr.needsUpdate = true
  animFrameId = requestAnimationFrame(tickTerrain)
}

// ── public API ────────────────────────────────────────────────────

export async function explodeTorus() {
  // 1. fade torus out
  await fadeTorus()

  // 2. build terrain if first time
  if (!pointsObj) buildTerrain()

  terrainActive  = true
  terrainVisible = true
  startTime = performance.now()

  // 3. start terrain animation + camera dolly simultaneously
  tickTerrain()
  lerpCamera(CAM_TORUS, CAM_TERRAIN, 900)

  // 4. fade terrain in
  await fadePoints(0, 0.82, 600)
}

export async function dissolveTerrain() {
  if (!terrainVisible) return

  // 1. fade terrain out
  await fadePoints(0.82, 0, 450)

  // 2. stop terrain tick
  terrainActive = false
  cancelAnimationFrame(animFrameId)

  // 3. camera dolly back to torus position
  lerpCamera(CAM_TERRAIN, CAM_TORUS, 800)

  // 4. reveal torus (starts after camera begins moving)
  setTimeout(() => revealTorus(), 300)

  terrainVisible = false
}
