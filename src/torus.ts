// ─── torus.ts v2 ──────────────────────────────────────────────────
// Smaller torus, exports mesh + geometry ref for particles.ts
// Also exports fadeTorus() to dissolve on explosion.

import * as THREE from 'three'

export let torusMesh: THREE.Mesh | null = null
export let torusGeo:  THREE.TorusGeometry | null = null
let renderer: THREE.WebGLRenderer
let scene: THREE.Scene
let camera: THREE.PerspectiveCamera
let animId: number

export function getScene()    { return scene }
export function getRenderer() { return renderer }
export function getCamera()   { return camera }

export function initTorus() {
  const canvas = document.getElementById('canvas') as HTMLCanvasElement
  if (!canvas) return

  renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true })
  renderer.setClearColor(0x000000, 0)
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))

  scene  = new THREE.Scene()
  camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 100)
  camera.position.set(0, 0, 5)

  // smaller torus — fits neatly in zone-c
  torusGeo  = new THREE.TorusGeometry(0.72, 0.26, 24, 80)
  const mat = new THREE.MeshBasicMaterial({
    color: 0xf2f0e8,
    wireframe: true,
    opacity: 0.22,
    transparent: true,
  })
  torusMesh = new THREE.Mesh(torusGeo, mat)
  torusMesh.rotation.x = Math.PI / 5
  scene.add(torusMesh)

  resize()
  window.addEventListener('resize', resize)
  animate()
}

export function fadeTorus(): Promise<void> {
  return new Promise((resolve) => {
    if (!torusMesh) { resolve(); return }
    const mat = torusMesh.material as THREE.MeshBasicMaterial
    const duration = 400
    const start = performance.now()
    const startOpacity = mat.opacity

    function fade() {
      const p = Math.min((performance.now() - start) / duration, 1)
      mat.opacity = startOpacity * (1 - p)
      if (p < 1) {
        requestAnimationFrame(fade)
      } else {
        if (torusMesh) torusMesh.visible = false
        resolve()
      }
    }
    fade()
  })
}

function resize() {
  camera.aspect = window.innerWidth / window.innerHeight
  camera.updateProjectionMatrix()
  renderer.setSize(window.innerWidth, window.innerHeight)
}

function animate() {
  animId = requestAnimationFrame(animate)
  if (torusMesh && torusMesh.visible) {
    torusMesh.rotation.y += 0.003
    torusMesh.rotation.z += 0.001
  }
  renderer.render(scene, camera)
}
