// ─── frame.ts v3 ──────────────────────────────────────────────────
// Open:  explodeTorus() → flip → expand → reveal program
// Close: collapse → flip back → dissolveTerrain() → revealTorus()

import { renderProgram, revealProgram } from './program'
import { explodeTorus, dissolveTerrain } from './particles'

export function initFrame() {
  const card  = document.getElementById('card')  as HTMLElement
  const cta   = document.getElementById('cta')   as HTMLButtonElement
  const close = document.getElementById('close') as HTMLButtonElement
  const days  = document.getElementById('program-days') as HTMLElement

  if (!card || !cta || !close || !days) return

  renderProgram(days)

  let isOpen = false

  cta.addEventListener('click', async () => {
    if (isOpen) return
    isOpen = true

    card.classList.add('elevated')

    // terrain transition starts immediately (async, non-blocking)
    explodeTorus()

    // flip after brief pause so terrain is starting to appear
    setTimeout(() => {
      card.classList.add('flipped')

      setTimeout(() => {
        card.classList.add('expanded')
        revealProgram(days)
      }, 680)
    }, 250)
  })

  close.addEventListener('click', () => {
    if (!isOpen) return

    // collapse card first
    card.classList.remove('expanded')

    setTimeout(() => {
      card.classList.remove('flipped')
      card.classList.remove('elevated')
      isOpen = false

      // reset program line visibility for next open
      days.querySelectorAll('.program-event')
          .forEach(el => el.classList.remove('visible'))

      // dissolve terrain → camera back → torus reappears
      dissolveTerrain()
    }, 520)
  })
}
