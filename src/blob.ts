// ─── blob.ts v2 ───────────────────────────────────────────────────
// Desktop: mouse-tracked lerp (3 different lag coefficients)
// Mobile:  autonomous sine/cosine orbit per blob — no mouse needed

interface BlobState {
  el: HTMLElement
  x: number
  y: number
  lag: number
}

const LAGS    = [0.04, 0.03, 0.06]

// autonomous drift params [xFreq, yFreq, xAmp, yAmp, xPhase, yPhase]
const DRIFTS: [number, number, number, number, number, number][] = [
  [0.30, 0.20, 180, 120, 0.0, 0.0],
  [0.25, 0.35, 200, 150, 1.2, 0.7],
  [0.40, 0.30, 140, 100, 2.4, 1.8],
]

export function initBlobs() {
  const els = Array.from(document.querySelectorAll<HTMLElement>('.blob'))
  if (!els.length) return

  const cx = window.innerWidth  / 2
  const cy = window.innerHeight / 2

  const state: BlobState[] = els.map((el, i) => ({
    el,
    x: cx,
    y: cy,
    lag: LAGS[i] ?? 0.05,
  }))

  const isMobile = window.matchMedia('(hover: none)').matches

  let mouseX = cx
  let mouseY = cy
  let startTime = performance.now()

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

      s.x += (targetX - s.x) * s.lag
      s.y += (targetY - s.y) * s.lag

      const hw = s.el.offsetWidth  / 2
      const hh = s.el.offsetHeight / 2
      s.el.style.transform = `translate(${s.x - hw}px, ${s.y - hh}px)`
    }

    requestAnimationFrame(tick)
  }

  tick()
}
