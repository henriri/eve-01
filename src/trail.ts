// ─── trail.ts v4 ──────────────────────────────────────────────────
// 2D canvas trail renderer.
// Each blob keeps a circular position history.
// Each frame: semi-transparent fill (fade) + draw tapered polyline per blob.

const HISTORY_LEN = 90
const FADE_FILL   = 'rgba(8, 8, 15, 0.20)'

// Trail colors match blob gradient colors
const TRAIL_COLORS = [
  '184, 228, 255',  // ice   — blob-a
  '204, 255, 0',    // fluo  — blob-b
  '232, 213, 255',  // lilac — blob-c
]

interface TrailState {
  history: Array<{ x: number; y: number }>
}

let ctx:    CanvasRenderingContext2D | null = null
let trails: TrailState[] = []
let positionGetters: Array<() => { x: number; y: number }> = []

export function initTrails(getters: Array<() => { x: number; y: number }>) {
  const canvas = document.getElementById('trail-canvas') as HTMLCanvasElement
  if (!canvas) return

  ctx = canvas.getContext('2d')!
  positionGetters = getters

  // init trail state
  trails = getters.map(() => ({ history: [] }))

  resize(canvas)
  window.addEventListener('resize', () => resize(canvas))

  tick()
}

function resize(canvas: HTMLCanvasElement) {
  canvas.width  = window.innerWidth
  canvas.height = window.innerHeight
}

function tick() {
  requestAnimationFrame(tick)
  if (!ctx) return

  // 1. semi-transparent fill → creates the fade/decay effect
  ctx.fillStyle = FADE_FILL
  ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height)

  // 2. update history + draw each trail
  for (let i = 0; i < trails.length; i++) {
    const pos = positionGetters[i]()
    const trail = trails[i]

    // push new position
    trail.history.push({ x: pos.x, y: pos.y })
    if (trail.history.length > HISTORY_LEN) {
      trail.history.shift()
    }

    drawTrail(trail.history, TRAIL_COLORS[i])
  }
}

function drawTrail(
  history: Array<{ x: number; y: number }>,
  color: string
) {
  if (!ctx || history.length < 2) return

  for (let i = 1; i < history.length; i++) {
    const t          = i / history.length       // 0 → tail, 1 → head
    const opacity    = t * t * 0.55             // quadratic — head brighter
    const lineWidth  = t * 1.8                  // taper: thin at tail

    ctx.beginPath()
    ctx.moveTo(history[i - 1].x, history[i - 1].y)
    ctx.lineTo(history[i].x,     history[i].y)
    ctx.strokeStyle = `rgba(${color}, ${opacity})`
    ctx.lineWidth   = lineWidth
    ctx.lineCap     = 'round'
    ctx.stroke()
  }
}
