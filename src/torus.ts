// ─── torus.ts — morph-points branch ──────────────────────────────
// Single Points object used for both torus and terrain states.
// Torus count: RADIAL_SEGS × TUBULAR_SEGS = 3072 points
// Exports rest positions + scene/camera refs + morph controls.

import * as THREE from 'three'

export const RADIAL_SEGS   = 32
export const TUBULAR_SEGS  = 96
export const TORUS_COUNT   = RADIAL_SEGS * TUBULAR_SEGS  // 3072

const RADIUS       = 0.9
const TUBE         = 0.16
const TORUS_X_BASE = Math.PI / 2.4
const DOT_OPACITY  = 0.88

const VERT_SHADER = `
  uniform float uBaseSize;
  uniform float uPixelRatio;
  uniform float uOpacity;
  void main() {
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = uBaseSize * uPixelRatio * (1.0 / -mvPosition.z);
    gl_Position  = projectionMatrix * mvPosition;
  }
`
const FRAG_SHADER = `
  uniform float uOpacity;
  void main() {
    if (length(gl_PointCoord - vec2(0.5)) > 0.5) discard;
    gl_FragColor = vec4(0.949, 0.941, 0.910, uOpacity);
  }
`

let renderer:  THREE.WebGLRenderer
let scene:     THREE.Scene
let camera:    THREE.PerspectiveCamera
let shaderMat: THREE.ShaderMaterial

// the one Points object used for everything
export let pointsObj: THREE.Points
export let posAttr:   THREE.BufferAttribute

// baked torus rest positions (never mutated after build)
export let restPositions: Float32Array

// live current positions (includes rotation drift)
export let currentPositions: Float32Array

let elapsed  = 0
let lastTime = 0
let spinning = true

export function getScene()    { return scene   }
export function getCamera()   { return camera  }
export function setSpinning(v: boolean) { spinning = v }

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

  // build torus geometry → extract positions → apply tilt
  const geo    = new THREE.TorusGeometry(RADIUS, TUBE, RADIAL_SEGS, TUBULAR_SEGS)
  const srcPos = geo.attributes.position as THREE.BufferAttribute
  const count  = srcPos.count

  restPositions    = new Float32Array(count * 3)
  currentPositions = new Float32Array(count * 3)

  const euler = new THREE.Euler(TORUS_X_BASE, 0, 0)
  const mat4  = new THREE.Matrix4().makeRotationFromEuler(euler)
  const vec   = new THREE.Vector3()

  for (let i = 0; i < count; i++) {
    vec.fromBufferAttribute(srcPos, i)
    vec.applyMatrix4(mat4)
    restPositions[i * 3]     = vec.x
    restPositions[i * 3 + 1] = vec.y
    restPositions[i * 3 + 2] = vec.z
    currentPositions[i * 3]     = vec.x
    currentPositions[i * 3 + 1] = vec.y
    currentPositions[i * 3 + 2] = vec.z
  }
  geo.dispose()

  const ptGeo = new THREE.BufferGeometry()
  posAttr     = new THREE.BufferAttribute(currentPositions.slice(), 3)
  posAttr.setUsage(THREE.DynamicDrawUsage)
  ptGeo.setAttribute('position', posAttr)

  shaderMat = new THREE.ShaderMaterial({
    uniforms: {
      uBaseSize:   { value: 8 },
      uPixelRatio: { value: Math.min(window.devicePixelRatio, 2) },
      uOpacity:    { value: DOT_OPACITY },
    },
    vertexShader:   VERT_SHADER,
    fragmentShader: FRAG_SHADER,
    transparent:    true,
  })

  pointsObj = new THREE.Points(ptGeo, shaderMat)
  scene.add(pointsObj)

  resize()
  window.addEventListener('resize', resize)
  animate()
}

// ── opacity helpers ───────────────────────────────────────────────
export function setOpacity(v: number) {
  shaderMat.uniforms.uOpacity.value = v
}
export function getOpacity() {
  return shaderMat.uniforms.uOpacity.value
}

export function fadeOpacity(from: number, to: number, duration: number): Promise<void> {
  return new Promise(resolve => {
    const start = performance.now()
    function step() {
      const p = Math.min((performance.now() - start) / duration, 1)
      shaderMat.uniforms.uOpacity.value = from + (to - from) * p
      if (p < 1) requestAnimationFrame(step)
      else resolve()
    }
    step()
  })
}

// ── reset to rest positions (called after merge completes) ────────
export function snapToRest() {
  for (let i = 0; i < restPositions.length; i++) {
    posAttr.array[i]      = restPositions[i]
    currentPositions[i]   = restPositions[i]
  }
  posAttr.needsUpdate = true
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

  if (spinning) {
    const cosZ = Math.cos(0.003)
    const sinZ = Math.sin(0.003)
    const xOsc = Math.sin(elapsed * 0.4) * 0.0008

    for (let i = 0; i < restPositions.length / 3; i++) {
      const ri = i * 3
      const x  = posAttr.array[ri]
      const y  = posAttr.array[ri + 1]
      const z  = posAttr.array[ri + 2]
      posAttr.array[ri]     = x * cosZ - y * sinZ
      posAttr.array[ri + 1] = x * sinZ + y * cosZ
      posAttr.array[ri + 1] += z * xOsc
      posAttr.array[ri + 2] -= posAttr.array[ri + 1] * xOsc
      // keep currentPositions in sync
      currentPositions[ri]     = posAttr.array[ri]
      currentPositions[ri + 1] = posAttr.array[ri + 1]
      currentPositions[ri + 2] = posAttr.array[ri + 2]
    }
    posAttr.needsUpdate = true
  }

  renderer.render(scene, camera)
}
