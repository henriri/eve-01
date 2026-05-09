// ─── particles.ts v4 ─────────────────────────────────────────────
// Dot terrain: full viewport bleed, randomised static elevation + travelling waves
// Open:  torus fades → camera dollies → terrain fades in
// Close: terrain fades out → camera back → torus reveals

import * as THREE from 'three'
import { fadeTorus, revealTorus, getScene, getCamera } from './torus'

// ── grid config ──────────────────────────────────────────────────
const COLS = 70
const ROWS = 55

// ── camera positions ─────────────────────────────────────────────
const CAM_TORUS   = new THREE.Vector3(0,   0, 5)
const CAM_TERRAIN = new THREE.Vector3(0, 3.5, 7)
const CAM_TARGET  = new THREE.Vector3(0,   0, 0)

// ── state ─────────────────────────────────────────────────────────
let pointsObj:     THREE.Points | null = null
let posAttr:       THREE.BufferAttribute
let staticY:       Float32Array          // baked random elevation per point
let terrainActive  = false
let terrainVisible = false
let animFrameId:   number
let startTime:     number

// ── camera lerp ───────────────────────────────────────────────────
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

// ── points opacity fade ───────────────────────────────────────────
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

// ── compute grid spacing to fill viewport ─────────────────────────
function computeSpacing(): { spacingX: number; spacingZ: number } {
  const cam    = getCamera()
  const fovRad = (cam.fov * Math.PI) / 180
  // approximate visible area at terrain depth (y ≈ 0, camera at z=7)
  const dist        = CAM_TERRAIN.z
  const visibleH    = 2 * Math.tan(fovRad / 2) * dist
  const visibleW    = visibleH * cam.aspect
  return {
    spacingX: (visibleW * 1.15) / (COLS - 1),  // 1.15 = slight overdraw margin
    spacingZ: (visibleH * 1.15) / (ROWS - 1),
  }
}

// ── build terrain ─────────────────────────────────────────────────
function buildTerrain() {
  const count = COLS * ROWS
  const { spacingX, spacingZ } = computeSpacing()
  const offsetX = (COLS - 1) * spacingX * 0.5
  const offsetZ = (ROWS - 1) * spacingZ * 0.5

  const posArr = new Float32Array(count * 3)
  staticY      = new Float32Array(count)

  // seeded random via simple LCG — deterministic terrain shape
  let seed = 42
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) & 0xffffffff
    return (seed >>> 0) / 0xffffffff
  }

  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const idx = r * COLS + c
      const wx  = c * spacingX - offsetX
      const wz  = r * spacingZ - offsetZ

      // static elevation: two sine waves + small random jitter
      const sy =
        Math.sin(wx * 2.1 + rand() * 2) * 0.40 +
        Math.sin(wz * 1.7 + rand() * 2) * 0.30 +
        (rand() - 0.5)                  * 0.12   // random jitter per point

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

  const mat = new THREE.PointsMaterial({
    color:           0xf2f0e8,
    size:            0.016,
    transparent:     true,
    opacity:         0,
    sizeAttenuation: true,
  })

  pointsObj = new THREE.Points(geo, mat)
  getScene().add(pointsObj)
}

// ── terrain tick ──────────────────────────────────────────────────
function tickTerrain() {
  if (!terrainActive || !pointsObj) return

  const t  = (performance.now() - startTime) / 1000
  const { spacingX, spacingZ } = computeSpacing()
  const offsetX = (COLS - 1) * spacingX * 0.5
  const offsetZ = (ROWS - 1) * spacingZ * 0.5

  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const idx = r * COLS + c
      const wx  = c * spacingX - offsetX
      const wz  = r * spacingZ - offsetZ

      // static base + travelling wave overlay
      const dy =
        Math.sin(wx * 1.2 + t * 1.4) * 0.20 +
        Math.sin(wz * 0.9 + t * 1.1) * 0.15 +
        Math.sin((wx + wz) * 0.6 + t * 0.8) * 0.08

      posAttr.array[idx * 3 + 1] = staticY[idx] + dy
    }
  }

  posAttr.needsUpdate = true
  animFrameId = requestAnimationFrame(tickTerrain)
}

// ── public API ────────────────────────────────────────────────────
export async function explodeTorus() {
  await fadeTorus()
  buildTerrain()
  terrainActive  = true
  terrainVisible = true
  startTime      = performance.now()
  tickTerrain()
  lerpCamera(CAM_TORUS, CAM_TERRAIN, 900)
  await fadePoints(0, 0.82, 650)
}

export async function dissolveTerrain() {
  if (!terrainVisible) return
  await fadePoints(0.82, 0, 450)
  terrainActive = false
  cancelAnimationFrame(animFrameId)
  lerpCamera(CAM_TERRAIN, CAM_TORUS, 800)
  setTimeout(() => revealTorus(), 300)
  terrainVisible = false
}
