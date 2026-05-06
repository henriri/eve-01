// ─── frame.ts ────────────────────────────────────────────────────
// Card flip + expand interaction.
// 1. CTA click  → flip (rotateY 180deg) → then expand
// 2. Close click → collapse → flip back

import { renderProgram, revealProgram } from './program'

export function initFrame() {
  const card    = document.getElementById('card') as HTMLElement
  const cta     = document.getElementById('cta') as HTMLButtonElement
  const close   = document.getElementById('close') as HTMLButtonElement
  const days    = document.getElementById('program-days') as HTMLElement

  if (!card || !cta || !close || !days) return

  // pre-render program content into the back face
  renderProgram(days)

  let isOpen = false

  cta.addEventListener('click', () => {
    if (isOpen) return
    isOpen = true

    // step 1: flip
    card.classList.add('flipped')

    // step 2: expand after flip completes (650ms)
    setTimeout(() => {
      card.classList.add('expanded')
      // step 3: stagger in program lines
      revealProgram(days)
    }, 680)
  })

  close.addEventListener('click', () => {
    if (!isOpen) return

    // collapse first
    card.classList.remove('expanded')

    // flip back after collapse (500ms width/height transition)
    setTimeout(() => {
      card.classList.remove('flipped')
      isOpen = false

      // reset event visibility for next open
      days.querySelectorAll('.program-event').forEach((el) =>
        el.classList.remove('visible')
      )
    }, 520)
  })
}
