// ─── blob.ts ─────────────────────────────────────────────────────
// Three absolutely-positioned radial gradient divs that follow
// the mouse with different lag coefficients for organic feel.

interface BlobState {
  el: HTMLElement
  x: number
  y: number
  lag: number
}

export function initBlobs() {
  const blobs = Array.from(
    document.querySelectorAll<HTMLElement>('.blob')
  )

  if (!blobs.length) return

  // lag coefficients — lower = slower/heavier
  const lags = [0.04, 0.03, 0.06]

  const state: BlobState[] = blobs.map((el, i) => {
    const rect = el.getBoundingClientRect()
    return {
      el,
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2,
      lag: lags[i] ?? 0.05,
    }
  })

  let mouseX = window.innerWidth / 2
  let mouseY = window.innerHeight / 2

  window.addEventListener('mousemove', (e) => {
    mouseX = e.clientX
    mouseY = e.clientY
  })

  function tick() {
    for (const s of state) {
      s.x += (mouseX - s.x) * s.lag
      s.y += (mouseY - s.y) * s.lag

      // offset so blob centre follows cursor, not blob top-left
      const el = s.el
      const hw = el.offsetWidth / 2
      const hh = el.offsetHeight / 2
      el.style.transform = `translate(${s.x - hw}px, ${s.y - hh}px)`
      el.style.position = 'fixed'
      el.style.left = '0'
      el.style.top = '0'
    }
    requestAnimationFrame(tick)
  }

  tick()
}
