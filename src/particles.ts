// ─── particles.ts ────────────────────────────────────────────────
// Samples torus vertices → creates GPU-efficient Points confetti
// Each particle drifts perpetually with sine wobble + drag

import * as THREE from 'three'
import { torusGeo, torusMesh, fadeTorus, getScene } from './torus'

// Blob palette — confetti inherit these colors
const COLORS = [
  new THREE.Color(0xB8E4FF), // ice
  new THREE.Color(0xCCFF00), // fluo
  new THREE.Color(0xE8D5FF), // lilac
  new THREE.Color(0xFF4D1C), // rust
  new THREE.Color(0xF2F0E8), // off-white
]

interface Particle {
  pos: THREE.Vector3
  vel: THREE.Vector3
  wobble: THREE.Vector3  // per-axis wobble frequency
  phase: THREE.Vector3   // per-axis wobble phase offset
  amp: number            // wobble amplitude
}

let particles: Particle[] = []
let pointsObj: THREE.Points | null = null
let posAttr: THREE.BufferAttribute
let active = false
let startTime = 0

export async function explodeTorus() {
  if (!torusGeo || !torusMesh) return

  // 1. fade out torus mesh
  await fadeTorus()

  // 2. sample positions from torus geometry
  const positions = torusGeo.attributes.position
  const count = positions.count

  const posArr   = new Float32Array(count * 3)
  const colArr   = new Float32Array(count * 3)

  particles = []

  const torusWorld = new THREE.Vector3()

  for (let i = 0; i < count; i++) {
    torusWorld.fromBufferAttribute(positions, i)
    // apply torus mesh rotation to world space
    torusWorld.applyEuler(torusMesh.rotation)

    const vel = new THREE.Vector3(
      (Math.random() - 0.5) * 0.06,
      (Math.random() - 0.5) * 0.06,
      (Math.random() - 0.5) * 0.04,
    )

    const p: Particle = {
      pos: torusWorld.clone(),
      vel,
      wobble: new THREE.Vector3(
        0.4 + Math.random() * 0.6,
        0.3 + Math.random() * 0.5,
        0.2 + Math.random() * 0.4,
      ),
      phase: new THREE.Vector3(
        Math.random() * Math.PI * 2,
        Math.random() * Math.PI * 2,
        Math.random() * Math.PI * 2,
      ),
      amp: 0.004 + Math.random() * 0.008,
    }
    particles.push(p)

    posArr[i * 3]     = p.pos.x
    posArr[i * 3 + 1] = p.pos.y
    posArr[i * 3 + 2] = p.pos.z

    const col = COLORS[Math.floor(Math.random() * COLORS.length)]
    colArr[i * 3]     = col.r
    colArr[i * 3 + 1] = col.g
    colArr[i * 3 + 2] = col.b
  }

  // 3. build Points object
  const geo = new THREE.BufferGeometry()
  posAttr = new THREE.BufferAttribute(posArr, 3)
  geo.setAttribute('position', posAttr)
  geo.setAttribute('color',    new THREE.BufferAttribute(colArr, 3))

  const mat = new THREE.PointsMaterial({
    size: 0.025,
    vertexColors: true,
    transparent: true,
    opacity: 0.85,
    sizeAttenuation: true,
  })

  pointsObj = new THREE.Points(geo, mat)
  getScene().add(pointsObj)

  active = true
  startTime = performance.now()
  tickParticles()
}

function tickParticles() {
  if (!active || !pointsObj) return

  const t = (performance.now() - startTime) / 1000

  for (let i = 0; i < particles.length; i++) {
    const p = particles[i]

    // apply velocity with drag
    p.vel.multiplyScalar(0.985)
    p.pos.add(p.vel)

    // sine wobble for organic perpetual drift
    const wx = Math.sin(t * p.wobble.x + p.phase.x) * p.amp
    const wy = Math.cos(t * p.wobble.y + p.phase.y) * p.amp
    const wz = Math.sin(t * p.wobble.z + p.phase.z) * p.amp * 0.5

    posAttr.array[i * 3]     = p.pos.x + wx
    posAttr.array[i * 3 + 1] = p.pos.y + wy
    posAttr.array[i * 3 + 2] = p.pos.z + wz
  }

  posAttr.needsUpdate = true
  requestAnimationFrame(tickParticles)
}
