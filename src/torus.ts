// ─── torus.ts ─────────────────────────────────────────────────────
// A single wireframe torus rendered in Three.js.
// Transparent background, sits above blobs, below the frame.

import * as THREE from 'three'

export function initTorus() {
  const canvas = document.getElementById('canvas') as HTMLCanvasElement
  if (!canvas) return

  const renderer = new THREE.WebGLRenderer({
    canvas,
    alpha: true,
    antialias: true,
  })
  renderer.setClearColor(0x000000, 0)
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))

  const scene = new THREE.Scene()

  const camera = new THREE.PerspectiveCamera(
    45,
    window.innerWidth / window.innerHeight,
    0.1,
    100
  )
  camera.position.set(0, 0, 5)

  // torus — radius, tube, radialSegments, tubularSegments
  const geometry = new THREE.TorusGeometry(1.2, 0.42, 24, 80)
  const material = new THREE.MeshBasicMaterial({
    color: 0xf2f0e8,
    wireframe: true,
    opacity: 0.18,
    transparent: true,
  })
  const torus = new THREE.Mesh(geometry, material)
  torus.rotation.x = Math.PI / 5
  scene.add(torus)

  function resize() {
    camera.aspect = window.innerWidth / window.innerHeight
    camera.updateProjectionMatrix()
    renderer.setSize(window.innerWidth, window.innerHeight)
  }

  resize()
  window.addEventListener('resize', resize)

  function animate() {
    requestAnimationFrame(animate)
    torus.rotation.y += 0.003
    torus.rotation.z += 0.001
    renderer.render(scene, camera)
  }

  animate()
}
