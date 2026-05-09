// ─── blob.ts v4 ───────────────────────────────────────────────────
// - Fixed mobile init flash (apply transform before first tick)
// - Larger drift amplitudes for visible mobile movement
// - Per-blob time offset so they never start in sync
// - Exposes getPosition() callbacks for trail.ts

interface BlobConfig {
  lag:     number
  scale:   number
  opacity: number
  timeOffset: number  // seconds — staggers autonomous start positions
}

const CONFIGS: BlobConfig[] = [
  { lag: 0.08,  scale: 1.00, opacity: 0.55, timeOffset: 0.0  },
  { lag: 0.035, scale: 0.88, opacity: 0.42, timeOffset: 2.1  },
  { lag: 0.016, scale: 0.72, opacity: 0.32, timeOffset: 4.7  },
]

// [xFreq, yFreq, xAmp, yAmp, xPhase, yPhase]
const DRIFTS: [number, number, number, number, number, number][] = [
  [0.30, 0.20, 240, 200, 0.0, 0.0],
  [0.22, 0.32, 280, 220, 1.2, 0.7],
  [0.38, 0.28, 200, 180, 2.4, 1.8],
]

interface BlobState {
  el:     HTMLElement
  x:      number
  y:      number
  cfg:    BlobConfig
}

// exposed for trail.ts
export const blobPositions: Array<{ x: number; y: number }> = [
  { x: 0, y: 0 },
  { x: 0, y: 0 },
  { x: 0, y: 0 },
]

export function initBlobs() {
  const els = Array.from(document.querySelectorAll<HTMLElement>('.blob'))
  if (!els.length) return

  const cx = window.innerWidth  / 2
  const cy = window.innerHeight / 2

  const state: BlobState[] = els.map((el, i) => {
    const cfg = CONFIGS[i] ?? CONFIGS[0]
    el.style.opacity = String(cfg.opacity)
    // apply initial transform immediately — prevents mobile flash at 0,0
    const hw = el.offsetWidth  / 2
    const hh = el.offsetHeight / 2
    el.style.position  = 'fixed'
    el.style.left      = '0'
    el.style.top       = '0'
    el.style.transform = `translate(${cx - hw}px, ${cy - hh}px) scale(${cfg.scale})`
    return { el, x: cx, y: cy, cfg }
  })

  // update blobPositions immediately so trail has valid start data
  for (let i = 0; i < state.length; i++) {
    blobPositions[i].x = cx
    blobPositions[i].y = cy
  }

  const isMobile  = window.matchMedia('(hover: none)').matches
  const startTime = performance.now()

  let mouseX = cx
  let mouseY = cy

  if (!isMobile) {
    window.addEventListener('mousemove', (e) => {
      mouseX = e.clientX
      mouseY = e.clientY
    })
  }

  function tick() {
    const t = (performance.now() - startTime) / 1000

    for (let i = 0; i < state.length; i++) {
      const s = state[i]

      let targetX: number
      let targetY: number

      if (isMobile) {
        const [xf, yf, xa, ya, xp, yp] = DRIFTS[i]
        const to = s.cfg.timeOffset
        targetX = cx + Math.sin(t * xf + xp + to) * xa
        targetY = cy + Math.cos(t * yf + yp + to) * ya
      } else {
        targetX = mouseX
        targetY = mouseY
      }

      s.x += (targetX - s.x) * s.cfg.lag
      s.y += (targetY - s.y) * s.cfg.lag

      const hw = s.el.offsetWidth  / 2
      const hh = s.el.offsetHeight / 2
      s.el.style.transform = `translate(${s.x - hw}px, ${s.y - hh}px) scale(${s.cfg.scale})`

      // update shared positions for trail renderer
      blobPositions[i].x = s.x
      blobPositions[i].y = s.y
    }

    requestAnimationFrame(tick)
  }

  tick()
}
