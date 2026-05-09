// ─── frame.ts v2 ──────────────────────────────────────────────────
// CTA click → explode torus → flip card → expand
// Close → collapse → flip back
// Card gets .elevated class on open to sit above canvas

import { renderProgram, revealProgram } from './program'
import { explodeTorus } from './particles'

export function initFrame() {
  const card  = document.getElementById('card') as HTMLElement
  const cta   = document.getElementById('cta') as HTMLButtonElement
  const close = document.getElementById('close') as HTMLButtonElement
  const days  = document.getElementById('program-days') as HTMLElement

  if (!card || !cta || !close || !days) return

  renderProgram(days)

  let isOpen = false

  cta.addEventListener('click', async () => {
    if (isOpen) return
    isOpen = true

    // 1. elevate card z-index
    card.classList.add('elevated')

    // 2. explode torus (async — fades torus then spawns particles)
    explodeTorus()

    // 3. flip after short pause (particles appearing)
    setTimeout(() => {
      card.classList.add('flipped')

      // 4. expand + reveal program lines after flip completes
      setTimeout(() => {
        card.classList.add('expanded')
        revealProgram(days)
      }, 680)
    }, 200)
  })

  close.addEventListener('click', () => {
    if (!isOpen) return

    card.classList.remove('expanded')

    setTimeout(() => {
      card.classList.remove('flipped')
      isOpen = false

      // reset lines for next open
      days.querySelectorAll('.program-event')
        .forEach(el => el.classList.remove('visible'))
    }, 520)
  })
}
