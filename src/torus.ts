// ─── torus.ts v6 ──────────────────────────────────────────────────
// Torus rendered as Points (dots) not wireframe mesh.
// Thinner tube, larger hole, tilted ~75° for perspective.
// Exports: initTorus, getScene, getCamera, getTorusPositions,
//          fadeTorus, revealTorus, animateTorusBreak, animateTorusMerge

import * as THREE from 'three'

// ── geometry params ───────────────────────────────────────────────
const RADIUS          = 0.9
const TUBE            = 0.16
const RADIAL_SEGS     = 32
const TUBULAR_SEGS    = 96
const TORUS_X_BASE    = Math.PI / 2.4   // ~75° — tilted, not flat coin
const DOT_OPACITY     = 0.75

// ── shader — matches terrain shader for visual consistency ────────
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
    vec2  uv   = gl_PointCoord - vec2(0.5);
    if (length(uv) > 0.5) discard;
    gl_FragColor = vec4(0.949, 0.941, 0.910, uOpacity);
  }
`

// ── state ─────────────────────────────────────────────────────────
let renderer:   THREE.WebGLRenderer
let scene:      THREE.Scene
let camera:     THREE.PerspectiveCamera
let pointsObj:  THREE.Points | null = null
let shaderMat:  THREE.ShaderMaterial | null = null
let posAttr:    THREE.BufferAttribute

// baked rest positions for merge-back animation
let restPositions: Float32Array

let elapsed  = 0
let lastTime = 0
let spinning = true

export function getScene()  { return scene  }
export function getCamera() { return camera }

// returns copy of rest positions for particles.ts to use in merge anim
export function getTorusPositions(): Float32Array {
  return restPositions.slice()
}

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

  buildTorusPoints()
  resize()
  window.addEventListener('resize', resize)
  animate()
}

function buildTorusPoints() {
  // Generate torus vertex positions manually so we control count
  const geo   = new THREE.TorusGeometry(RADIUS, TUBE, RADIAL_SEGS, TUBULAR_SEGS)
  const srcPos = geo.attributes.position as THREE.BufferAttribute
  const count  = srcPos.count

  restPositions = new Float32Array(count * 3)

  // Apply base tilt to rest positions
  const euler = new THREE.Euler(TORUS_X_BASE, 0, 0)
  const mat4  = new THREE.Matrix4().makeRotationFromEuler(euler)
  const vec   = new THREE.Vector3()

  for (let i = 0; i < count; i++) {
    vec.fromBufferAttribute(srcPos, i)
    vec.applyMatrix4(mat4)
    restPositions[i * 3]     = vec.x
    restPositions[i * 3 + 1] = vec.y
    restPositions[i * 3 + 2] = vec.z
  }
  geo.dispose()

  const pointGeo = new THREE.BufferGeometry()
  posAttr        = new THREE.BufferAttribute(restPositions.slice(), 3)
  pointGeo.setAttribute('position', posAttr)

  shaderMat = new THREE.ShaderMaterial({
    uniforms: {
      uBaseSize:   { value: 30 },
      uPixelRatio: { value: Math.min(window.devicePixelRatio, 2) },
      uOpacity:    { value: DOT_OPACITY },
    },
    vertexShader:   VERT_SHADER,
    fragmentShader: FRAG_SHADER,
    transparent:    true,
  })

  pointsObj = new THREE.Points(pointGeo, shaderMat)
  scene.add(pointsObj)
}

// ── fade out torus dots ───────────────────────────────────────────
export function fadeTorus(): Promise<void> {
  return new Promise((resolve) => {
    if (!shaderMat) { resolve(); return }
    spinning = false
    const start     = performance.now()
    const startOpac = shaderMat.uniforms.uOpacity.value
    function step() {
      const p = Math.min((performance.now() - start) / 400, 1)
      shaderMat!.uniforms.uOpacity.value = startOpac * (1 - p)
      if (p < 1) requestAnimationFrame(step)
      else { if (pointsObj) pointsObj.visible = false; resolve() }
    }
    step()
  })
}

// ── fade torus back in at rest positions ──────────────────────────
export function revealTorus(): Promise<void> {
  return new Promise((resolve) => {
    if (!shaderMat || !pointsObj || !posAttr) { resolve(); return }
    // reset positions to rest
    for (let i = 0; i < restPositions.length; i++) {
      posAttr.array[i] = restPositions[i]
    }
    posAttr.needsUpdate = true
    pointsObj.visible   = true
    shaderMat.uniforms.uOpacity.value = 0
    spinning = true
    const start = performance.now()
    function step() {
      const p = Math.min((performance.now() - start) / 500, 1)
      shaderMat!.uniforms.uOpacity.value = DOT_OPACITY * p
      if (p < 1) requestAnimationFrame(step)
      else resolve()
    }
    step()
  })
}

// ── break: torus dots scatter outward ────────────────────────────
// Called from particles.ts — animates dots flying outward then fades
export function animateTorusBreak(): Promise<void> {
  return new Promise((resolve) => {
    if (!pointsObj || !shaderMat || !posAttr) { resolve(); return }
    spinning = false
    const count = restPositions.length / 3

    // per-point velocity: outward from centre + random jitter
    const vels = new Float32Array(count * 3)
    for (let i = 0; i < count; i++) {
      const x = restPositions[i * 3]
      const y = restPositions[i * 3 + 1]
      const z = restPositions[i * 3 + 2]
      const len = Math.sqrt(x*x + y*y + z*z) || 1
      vels[i * 3]     = (x / len) * 0.035 + (Math.random() - 0.5) * 0.02
      vels[i * 3 + 1] = (y / len) * 0.035 + (Math.random() - 0.5) * 0.02
      vels[i * 3 + 2] = (z / len) * 0.035 + (Math.random() - 0.5) * 0.015
    }

    const duration = 900
    const start    = performance.now()
    const startOpac = shaderMat.uniforms.uOpacity.value

    function step() {
      const p = Math.min((performance.now() - start) / duration, 1)

      for (let i = 0; i < count; i++) {
        posAttr.array[i * 3]     += vels[i * 3]
        posAttr.array[i * 3 + 1] += vels[i * 3 + 1]
        posAttr.array[i * 3 + 2] += vels[i * 3 + 2]
        // drag
        vels[i * 3]     *= 0.94
        vels[i * 3 + 1] *= 0.94
        vels[i * 3 + 2] *= 0.94
      }
      posAttr.needsUpdate = true

      // fade out in second half
      if (p > 0.4) {
        const fp = (p - 0.4) / 0.6
        shaderMat!.uniforms.uOpacity.value = startOpac * (1 - fp)
      }

      if (p < 1) requestAnimationFrame(step)
      else { if (pointsObj) pointsObj.visible = false; resolve() }
    }
    step()
  })
}

// ── merge: dots converge from scattered back to rest positions ────
// particles.ts calls this with current scattered positions
export function animateTorusMerge(fromPositions: Float32Array): Promise<void> {
  return new Promise((resolve) => {
    if (!pointsObj || !shaderMat || !posAttr) { resolve(); return }

    // set starting positions to wherever dots currently are
    for (let i = 0; i < fromPositions.length; i++) {
      posAttr.array[i] = fromPositions[i]
    }
    posAttr.needsUpdate = true
    pointsObj.visible   = true
    shaderMat.uniforms.uOpacity.value = 0

    const count    = restPositions.length / 3
    const duration = 1000
    const start    = performance.now()

    function step() {
      const p  = Math.min((performance.now() - start) / duration, 1)
      const ep = 1 - Math.pow(1 - p, 3)  // ease-out cubic

      for (let i = 0; i < count; i++) {
        const ri = i * 3
        posAttr.array[ri]     += (restPositions[ri]     - posAttr.array[ri])     * 0.06
        posAttr.array[ri + 1] += (restPositions[ri + 1] - posAttr.array[ri + 1]) * 0.06
        posAttr.array[ri + 2] += (restPositions[ri + 2] - posAttr.array[ri + 2]) * 0.06
      }
      posAttr.needsUpdate = true

      // fade in during second half
      if (p > 0.3) {
        const fp = (p - 0.3) / 0.7
        shaderMat!.uniforms.uOpacity.value = DOT_OPACITY * fp * ep
      }

      if (p < 1) requestAnimationFrame(step)
      else {
        // snap to exact rest
        for (let i = 0; i < restPositions.length; i++) {
          posAttr.array[i] = restPositions[i]
        }
        posAttr.needsUpdate = true
        shaderMat!.uniforms.uOpacity.value = DOT_OPACITY
        spinning = true
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
  const now   = performance.now()
  const delta = Math.min((now - lastTime) / 1000, 0.05)
  lastTime    = now
  elapsed    += delta

  if (pointsObj && pointsObj.visible && spinning && posAttr) {
    // rotate points in-place: Z spin + gentle X nod, Y locked
    const cosZ = Math.cos(0.003)
    const sinZ = Math.sin(0.003)
    const xOsc = Math.sin(elapsed * 0.4) * 0.0008  // tiny X oscillation per frame

    for (let i = 0; i < restPositions.length / 3; i++) {
      const ri = i * 3
      const x  = posAttr.array[ri]
      const y  = posAttr.array[ri + 1]
      const z  = posAttr.array[ri + 2]

      // Z rotation
      posAttr.array[ri]     = x * cosZ - y * sinZ
      posAttr.array[ri + 1] = x * sinZ + y * cosZ

      // tiny X nod
      posAttr.array[ri + 1] += z * xOsc
      posAttr.array[ri + 2] -= posAttr.array[ri + 1] * xOsc
    }
    posAttr.needsUpdate = true
  }

  renderer.render(scene, camera)
}
