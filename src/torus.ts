// ─── torus.ts v3 ──────────────────────────────────────────────────
// - Y-only auto-rotation (no banking/pitch drift)
// - Fixed shallow X tilt (15°) — stays horizontal
// - Opacity 0.08 — ghost presence
// - Exports: fadeTorus(), revealTorus(), getScene(), getCamera()

import * as THREE from 'three'

export let torusMesh: THREE.Mesh | null = null
export let torusGeo:  THREE.TorusGeometry | null = null

let renderer: THREE.WebGLRenderer
let scene:    THREE.Scene
let camera:   THREE.PerspectiveCamera

export function getScene()  { return scene  }
export function getCamera() { return camera }

const TORUS_OPACITY   = 0.08
const TORUS_X_TILT    = Math.PI / 12  // 15° — horizontal ring, not tilted donut

export function initTorus() {
  const canvas = document.getElementById('canvas') as HTMLCanvasElement
  if (!canvas) return

  renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true })
  renderer.setClearColor(0x000000, 0)
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))

  scene  = new THREE.Scene()
  camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 100)
  camera.position.set(0, 0, 5)
  camera.lookAt(0, 0, 0)

  torusGeo  = new THREE.TorusGeometry(0.72, 0.26, 24, 80)
  const mat = new THREE.MeshBasicMaterial({
    color: 0xf2f0e8,
    wireframe:   true,
    opacity:     TORUS_OPACITY,
    transparent: true,
  })
  torusMesh = new THREE.Mesh(torusGeo, mat)
  torusMesh.rotation.x = TORUS_X_TILT  // fixed shallow tilt, never changes
  scene.add(torusMesh)

  resize()
  window.addEventListener('resize', resize)
  animate()
}

// fade torus out → resolves when invisible
export function fadeTorus(): Promise<void> {
  return new Promise((resolve) => {
    if (!torusMesh) { resolve(); return }
    const mat = torusMesh.material as THREE.MeshBasicMaterial
    const duration  = 400
    const start     = performance.now()
    const startOpac = mat.opacity

    function step() {
      const p = Math.min((performance.now() - start) / duration, 1)
      mat.opacity = startOpac * (1 - p)
      if (p < 1) {
        requestAnimationFrame(step)
      } else {
        if (torusMesh) torusMesh.visible = false
        resolve()
      }
    }
    step()
  })
}

// fade torus back in → resolves when fully visible
export function revealTorus(): Promise<void> {
  return new Promise((resolve) => {
    if (!torusMesh) { resolve(); return }
    torusMesh.visible = true
    const mat = torusMesh.material as THREE.MeshBasicMaterial
    mat.opacity = 0
    const duration = 500
    const start    = performance.now()

    function step() {
      const p = Math.min((performance.now() - start) / duration, 1)
      mat.opacity = TORUS_OPACITY * p
      if (p < 1) {
        requestAnimationFrame(step)
      } else {
        resolve()
      }
    }
    step()
  })
}

function resize() {
  camera.aspect = window.innerWidth / window.innerHeight
  camera.updateProjectionMatrix()
  renderer.setSize(window.innerWidth, window.innerHeight)
}

function animate() {
  requestAnimationFrame(animate)
  // Y-only rotation — no banking, no pitch drift
  if (torusMesh && torusMesh.visible) {
    torusMesh.rotation.y += 0.0025
  }
  renderer.render(scene, camera)
}
