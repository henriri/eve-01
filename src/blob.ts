// ─── blob.ts v3 ───────────────────────────────────────────────────
// Three distinct lag + scale + opacity values → clear depth layering
// Desktop: mouse lerp  |  Mobile: autonomous sine orbit

interface BlobConfig {
  lag:     number
  scale:   number
  opacity: number
}

const CONFIGS: BlobConfig[] = [
  { lag: 0.08,  scale: 1.00, opacity: 0.55 }, // A — front, snappy
  { lag: 0.035, scale: 0.88, opacity: 0.42 }, // B — mid
  { lag: 0.016, scale: 0.72, opacity: 0.32 }, // C — back, heavy
]

// autonomous drift [xFreq, yFreq, xAmp, yAmp, xPhase, yPhase]
const DRIFTS: [number, number, number, number, number, number][] = [
  [0.30, 0.20, 180, 120, 0.0, 0.0],
  [0.22, 0.32, 160, 130, 1.2, 0.7],
  [0.38, 0.28, 120,  90, 2.4, 1.8],
]

interface BlobState {
  el:  HTMLElement
  x:   number
  y:   number
  cfg: BlobConfig
}

export function initBlobs() {
  const els = Array.from(document.querySelectorAll<HTMLElement>('.blob'))
  if (!els.length) return

  const cx = window.innerWidth  / 2
  const cy = window.innerHeight / 2

  // apply initial scale + opacity from config
  const state: BlobState[] = els.map((el, i) => {
    const cfg = CONFIGS[i] ?? CONFIGS[0]
    el.style.opacity = String(cfg.opacity)
    el.style.transform = `scale(${cfg.scale})`
    return { el, x: cx, y: cy, cfg }
  })

  const isMobile = window.matchMedia('(hover: none)').matches
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
        targetX = cx + Math.sin(t * xf + xp) * xa
        targetY = cy + Math.cos(t * yf + yp) * ya
      } else {
        targetX = mouseX
        targetY = mouseY
      }

      s.x += (targetX - s.x) * s.cfg.lag
      s.y += (targetY - s.y) * s.cfg.lag

      const hw = s.el.offsetWidth  / 2
      const hh = s.el.offsetHeight / 2

      // combine position translate with depth scale
      s.el.style.transform = `translate(${s.x - hw}px, ${s.y - hh}px) scale(${s.cfg.scale})`
    }

    requestAnimationFrame(tick)
  }

  tick()
}
