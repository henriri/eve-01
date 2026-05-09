// ─── torus.ts — morph-linesegments branch ────────────────────────
// Torus rendered as LineSegments. Each segment collapses to a point
// via uCollapse uniform, then midpoints travel to terrain targets.
// On close: midpoints converge back, segments re-expand.

import * as THREE from 'three'

export const RADIAL_SEGS  = 32
export const TUBULAR_SEGS = 96
export const TORUS_COUNT  = RADIAL_SEGS * TUBULAR_SEGS  // 3072 segments

const RADIUS       = 0.9
const TUBE         = 0.16
const TORUS_X_BASE = Math.PI / 2.4
const LINE_OPACITY = 0.55

// Each segment: 2 vertices (start, end) + midpoint baked in
// Shader lerps start→mid and end→mid based on uCollapse [0..1]
const VERT_SHADER = `
  attribute vec3 aMid;        // midpoint of this segment
  attribute float aEndFlag;   // 0 = start vertex, 1 = end vertex
  uniform float uCollapse;    // 0 = full segment, 1 = collapsed to point
  uniform float uOpacity;

  void main() {
    // lerp this vertex toward the midpoint
    vec3 collapsed = mix(position, aMid, uCollapse);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(collapsed, 1.0);
  }
`
const FRAG_SHADER = `
  uniform float uOpacity;
  void main() {
    gl_FragColor = vec4(0.949, 0.941, 0.910, uOpacity);
  }
`

// ── point shader — used after full collapse for travel phase ──────
const VERT_POINT = `
  uniform float uBaseSize;
  uniform float uPixelRatio;
  void main() {
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = uBaseSize * uPixelRatio * (1.0 / -mvPosition.z);
    gl_Position  = projectionMatrix * mvPosition;
  }
`
const FRAG_POINT = `
  uniform float uOpacity;
  void main() {
    if (length(gl_PointCoord - vec2(0.5)) > 0.5) discard;
    gl_FragColor = vec4(0.949, 0.941, 0.910, uOpacity);
  }
`

let renderer:   THREE.WebGLRenderer
let scene:      THREE.Scene
let camera:     THREE.PerspectiveCamera

// line segments object (torus at rest + collapse animation)
let lineObj:    THREE.LineSegments
let lineMat:    THREE.ShaderMaterial
let linePosAttr: THREE.BufferAttribute // interleaved start/end for LineSegments

// points object (travel phase — midpoints moving to terrain)
export let pointsObj:  THREE.Points
export let pointsMat:  THREE.ShaderMaterial
export let midPosAttr: THREE.BufferAttribute // midpoint positions for travel

// baked data
export let restMids:      Float32Array  // original midpoint positions
export let restPositions: Float32Array  // for merge-back reference (= restMids)

let elapsed  = 0
let lastTime = 0
let spinning = true

// phase: 'lines' | 'collapsing' | 'points' | 'expanding'
export let phase: 'lines' | 'collapsing' | 'points' | 'expanding' = 'lines'

export function getScene()  { return scene  }
export function getCamera() { return camera }

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

  buildLineSegments()
  buildPointsObject()
  resize()
  window.addEventListener('resize', resize)
  animate()
}

function buildLineSegments() {
  const geo    = new THREE.TorusGeometry(RADIUS, TUBE, RADIAL_SEGS, TUBULAR_SEGS)
  const srcPos = geo.attributes.position as THREE.BufferAttribute
  const count  = srcPos.count  // = TORUS_COUNT

  // For LineSegments we need 2 vertices per segment interleaved: [s0,e0, s1,e1, ...]
  // We treat consecutive pairs of torus vertices as segments
  const linePos   = new Float32Array(count * 2 * 3)
  const midFlags  = new Float32Array(count * 2)
  const midDupe   = new Float32Array(count * 2 * 3)

  restMids      = new Float32Array(count * 3)
  restPositions = restMids  // alias

  const euler = new THREE.Euler(TORUS_X_BASE, 0, 0)
  const mat4  = new THREE.Matrix4().makeRotationFromEuler(euler)
  const vA    = new THREE.Vector3()
  const vB    = new THREE.Vector3()

  for (let i = 0; i < count; i++) {
    // each segment: vertex i and vertex (i+1) % count
    const next = (i + 1) % count
    vA.fromBufferAttribute(srcPos, i).applyMatrix4(mat4)
    vB.fromBufferAttribute(srcPos, next).applyMatrix4(mat4)

    const mx = (vA.x + vB.x) / 2
    const my = (vA.y + vB.y) / 2
    const mz = (vA.z + vB.z) / 2

    restMids[i * 3]     = mx
    restMids[i * 3 + 1] = my
    restMids[i * 3 + 2] = mz

    // interleaved: start then end
    linePos[i * 6]     = vA.x; linePos[i * 6 + 1] = vA.y; linePos[i * 6 + 2] = vA.z
    linePos[i * 6 + 3] = vB.x; linePos[i * 6 + 4] = vB.y; linePos[i * 6 + 5] = vB.z

    // aMid — same midpoint for both vertices of this segment
    midDupe[i * 6]     = mx; midDupe[i * 6 + 1] = my; midDupe[i * 6 + 2] = mz
    midDupe[i * 6 + 3] = mx; midDupe[i * 6 + 4] = my; midDupe[i * 6 + 5] = mz

    midFlags[i * 2]     = 0  // start
    midFlags[i * 2 + 1] = 1  // end
  }
  geo.dispose()

  const lineGeo = new THREE.BufferGeometry()
  linePosAttr   = new THREE.BufferAttribute(linePos, 3)
  linePosAttr.setUsage(THREE.DynamicDrawUsage)
  lineGeo.setAttribute('position', linePosAttr)
  lineGeo.setAttribute('aMid',     new THREE.BufferAttribute(midDupe, 3))
  lineGeo.setAttribute('aEndFlag', new THREE.BufferAttribute(midFlags, 1))

  lineMat = new THREE.ShaderMaterial({
    uniforms: { uCollapse: { value: 0 }, uOpacity: { value: LINE_OPACITY } },
    vertexShader:   VERT_SHADER,
    fragmentShader: FRAG_SHADER,
    transparent:    true,
  })

  lineObj = new THREE.LineSegments(lineGeo, lineMat)
  scene.add(lineObj)
}

function buildPointsObject() {
  // points object uses midpoint positions for the travel phase
  const ptGeo   = new THREE.BufferGeometry()
  midPosAttr    = new THREE.BufferAttribute(restMids.slice(), 3)
  midPosAttr.setUsage(THREE.DynamicDrawUsage)
  ptGeo.setAttribute('position', midPosAttr)

  pointsMat = new THREE.ShaderMaterial({
    uniforms: {
      uBaseSize:   { value: 6 },
      uPixelRatio: { value: Math.min(window.devicePixelRatio, 2) },
      uOpacity:    { value: 0 },
    },
    vertexShader:   VERT_POINT,
    fragmentShader: FRAG_POINT,
    transparent:    true,
  })
  pointsObj = new THREE.Points(ptGeo, pointsMat)
  pointsObj.visible = false
  scene.add(pointsObj)
}

// ── collapse: segments shrink to midpoints ────────────────────────
export function collapseSegments(): Promise<void> {
  return new Promise(resolve => {
    phase   = 'collapsing'
    spinning = false
    const start = performance.now()
    const dur   = 600
    function step() {
      const p = Math.min((performance.now() - start) / dur, 1)
      lineMat.uniforms.uCollapse.value = p
      // fade line opacity out in second half
      if (p > 0.5) lineMat.uniforms.uOpacity.value = LINE_OPACITY * (1 - (p - 0.5) / 0.5)
      if (p < 1) requestAnimationFrame(step)
      else {
        lineObj.visible = false
        // sync midPosAttr to current rest mids before travel
        for (let i = 0; i < restMids.length; i++) midPosAttr.array[i] = restMids[i]
        midPosAttr.needsUpdate = true
        pointsObj.visible = true
        pointsMat.uniforms.uOpacity.value = 0.6
        phase = 'points'
        resolve()
      }
    }
    step()
  })
}

// ── expand: points grow back into segments ────────────────────────
export function expandSegments(): Promise<void> {
  return new Promise(resolve => {
    phase = 'expanding'
    // sync line midpoints to current point positions before expanding
    // (points have already converged to rest mids via morphToTorus)
    lineObj.visible  = true
    lineMat.uniforms.uCollapse.value  = 1
    lineMat.uniforms.uOpacity.value   = 0
    pointsObj.visible = false

    const start = performance.now()
    const dur   = 700
    function step() {
      const p = Math.min((performance.now() - start) / dur, 1)
      lineMat.uniforms.uCollapse.value = 1 - p
      if (p > 0.3) lineMat.uniforms.uOpacity.value = LINE_OPACITY * ((p - 0.3) / 0.7)
      if (p < 1) requestAnimationFrame(step)
      else {
        lineMat.uniforms.uCollapse.value = 0
        lineMat.uniforms.uOpacity.value  = LINE_OPACITY
        phase   = 'lines'
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

  // rotate line segments when in lines phase
  if (spinning && phase === 'lines') {
    const cosZ = Math.cos(0.003)
    const sinZ = Math.sin(0.003)
    const xOsc = Math.sin(elapsed * 0.4) * 0.0008
    const arr  = linePosAttr.array as Float32Array
    for (let i = 0; i < arr.length / 3; i++) {
      const ri = i * 3
      const x = arr[ri], y = arr[ri+1], z = arr[ri+2]
      arr[ri]     = x * cosZ - y * sinZ
      arr[ri + 1] = x * sinZ + y * cosZ
      arr[ri + 1] += z * xOsc
      arr[ri + 2] -= arr[ri + 1] * xOsc
    }
    // also rotate aMid attribute to stay in sync
    const mArr = (lineObj.geometry.attributes['aMid'] as THREE.BufferAttribute).array as Float32Array
    for (let i = 0; i < mArr.length / 3; i++) {
      const ri = i * 3
      const x = mArr[ri], y = mArr[ri+1], z = mArr[ri+2]
      mArr[ri]     = x * cosZ - y * sinZ
      mArr[ri + 1] = x * sinZ + y * cosZ
      mArr[ri + 1] += z * xOsc
      mArr[ri + 2] -= mArr[ri + 1] * xOsc
    }
    // sync restMids to current aMid for collapse accuracy
    for (let i = 0; i < mArr.length; i++) restMids[i] = mArr[i]
    linePosAttr.needsUpdate = true
    ;(lineObj.geometry.attributes['aMid'] as THREE.BufferAttribute).needsUpdate = true
  }

  renderer.render(scene, camera)
}
