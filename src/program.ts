// ─── program.ts ───────────────────────────────────────────────────
// Static data — replace placeholders with real content when ready

export interface ProgramEvent { time: string; title: string }
export interface ProgramDay   { label: string; events: ProgramEvent[] }

export const PROGRAM: ProgramDay[] = [
  {
    label: 'Vendredi',
    events: [
      { time: '18:00', title: 'Orbite de stationnement' },
      { time: '21:00', title: '[placeholder]' },
      { time: '00:00', title: '[placeholder]' },
    ],
  },
  {
    label: 'Samedi',
    events: [
      { time: '18:00', title: '[placeholder]' },
      { time: '21:00', title: '[placeholder]' },
      { time: '00:00', title: 'Apogée' },
    ],
  },
  {
    label: 'Dimanche',
    events: [
      { time: '18:00', title: '[placeholder]' },
      { time: '21:00', title: '[placeholder]' },
      { time: '00:00', title: 'Rentrée atmosphérique' },
    ],
  },
  {
    label: 'Lundi',
    events: [
      { time: '09:00', title: 'Nominal.' },
      { time: '11:00', title: '[placeholder]' },
      { time: '13:00', title: 'We have AOS.' },
    ],
  },
]

export function renderProgram(container: HTMLElement) {
  container.innerHTML = ''
  for (const day of PROGRAM) {
    const dayEl = document.createElement('div')

    const label = document.createElement('div')
    label.className = 'program-day-label'
    label.textContent = day.label
    dayEl.appendChild(label)

    for (const ev of day.events) {
      const row  = document.createElement('div')
      row.className = 'program-event'

      const time = document.createElement('span')
      time.className = 'event-time'
      time.textContent = ev.time

      const title = document.createElement('span')
      title.className = 'event-title'
      title.textContent = ev.title

      row.appendChild(time)
      row.appendChild(title)
      dayEl.appendChild(row)
    }
    container.appendChild(dayEl)
  }
}

export function revealProgram(container: HTMLElement) {
  const events = container.querySelectorAll<HTMLElement>('.program-event')
  events.forEach((el, i) => {
    setTimeout(() => el.classList.add('visible'), i * 55)
  })
}
