// ─── torus.ts v4 ──────────────────────────────────────────────────
// - Base orientation: lying flat (rotation.x = PI/2)
// - Animates on Z axis (spin) + gentle X oscillation (nod)
// - Y axis locked — never rotates vertically

import * as THREE from 'three'

export let torusMesh: THREE.Mesh | null = null
export let torusGeo:  THREE.TorusGeometry | null = null

let renderer: THREE.WebGLRenderer
let scene:    THREE.Scene
let camera:   THREE.PerspectiveCamera
let elapsed = 0
let lastTime = 0

export function getScene()  { return scene  }
export function getCamera() { return camera }

const TORUS_OPACITY = 0.08
// PI/2 = lying flat. We'll oscillate X gently around this base.
const TORUS_X_BASE  = Math.PI / 2

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
    color:       0xf2f0e8,
    wireframe:   true,
    opacity:     TORUS_OPACITY,
    transparent: true,
  })
  torusMesh = new THREE.Mesh(torusGeo, mat)
  // start flat, y locked to 0
  torusMesh.rotation.x = TORUS_X_BASE
  torusMesh.rotation.y = 0
  torusMesh.rotation.z = 0
  scene.add(torusMesh)

  resize()
  window.addEventListener('resize', resize)
  animate()
}

export function fadeTorus(): Promise<void> {
  return new Promise((resolve) => {
    if (!torusMesh) { resolve(); return }
    const mat       = torusMesh.material as THREE.MeshBasicMaterial
    const duration  = 400
    const start     = performance.now()
    const startOpac = mat.opacity

    function step() {
      const p = Math.min((performance.now() - start) / duration, 1)
      mat.opacity = startOpac * (1 - p)
      if (p < 1) requestAnimationFrame(step)
      else { if (torusMesh) torusMesh.visible = false; resolve() }
    }
    step()
  })
}

export function revealTorus(): Promise<void> {
  return new Promise((resolve) => {
    if (!torusMesh) { resolve(); return }
    torusMesh.visible = true
    const mat      = torusMesh.material as THREE.MeshBasicMaterial
    mat.opacity    = 0
    const duration = 500
    const start    = performance.now()

    function step() {
      const p = Math.min((performance.now() - start) / duration, 1)
      mat.opacity = TORUS_OPACITY * p
      if (p < 1) requestAnimationFrame(step)
      else resolve()
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

  const now   = performance.now()
  const delta = Math.min((now - lastTime) / 1000, 0.05)
  lastTime    = now
  elapsed    += delta

  if (torusMesh && torusMesh.visible) {
    // Z: continuous spin — lies flat, rotates like a coin on a table
    torusMesh.rotation.z += 0.003

    // X: gentle oscillation around flat base — subtle nod ±~8°
    torusMesh.rotation.x = TORUS_X_BASE + Math.sin(elapsed * 0.4) * 0.15

    // Y: stays at 0 — never tilts to vertical
    torusMesh.rotation.y = 0
  }

  renderer.render(scene, camera)
}
