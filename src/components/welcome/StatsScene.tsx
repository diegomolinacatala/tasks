import { useState } from 'react'
import type { CSSProperties, PointerEvent as ReactPointerEvent } from 'react'
import { haptic } from '../../lib/platform/feedback'
import { useCopy } from '../../state/LanguageProvider'

/** Puntos que se quedan a la vista: los más antiguos se van. */
const MAX_DOTS = 36
/** Dónde toca el dedo de muestra (en % de la pantalla de mentira), uno tras otro cada `GHOST_STEP_MS`. */
const GHOST_TAPS: readonly (readonly [number, number])[] = [
  [18, 14],
  [70, 42],
  [34, 76],
]
const GHOST_STEP_MS = 1200

const COPY = {
  es: {
    rows: [
      { title: 'Cena con Carlota', meta: 'Vie · 21:00' },
      { title: 'Llamar a Ibán', meta: 'Mañana · 17:00' },
      { title: 'Regalo de Victor', meta: 'Al pasar por la floristería' },
      { title: 'Comprar pan', meta: 'Al llegar a Mercadona' },
    ],
    seen: 'Lo que ves',
    sent: 'Lo que llega',
    hint: 'Toca donde quieras',
    taps: (count: number) => `${count} ${count === 1 ? 'toque' : 'toques'} · ni una palabra`,
  },
  en: {
    rows: [
      { title: 'Dinner with Carlota', meta: 'Fri · 9:00 PM' },
      { title: 'Call Ibán', meta: 'Tomorrow · 5:00 PM' },
      { title: 'Gift for Victor', meta: 'When passing the florist' },
      { title: 'Buy bread', meta: 'When I get to the store' },
    ],
    seen: 'What you see',
    sent: 'What arrives',
    hint: 'Tap anywhere',
    taps: (count: number) => `${count} ${count === 1 ? 'tap' : 'taps'} · not a single word`,
  },
} as const

interface Dot {
  id: number
  /** En tanto por ciento de la pantalla de mentira, para que no se descoloquen si cambia de tamaño. */
  x: number
  y: number
}

/**
 * Lo que cuentan las estadísticas, con el dedo: una lista de mentira y, al tocarla, sus títulos se
 * tachan en gris (eso no viaja nunca) y cada toque deja un punto de calor, como en el mapa del panel.
 * Hasta el primer toque, un dedo de muestra toca en tres sitios.
 */
export function StatsScene() {
  const copy = useCopy(COPY)
  // `taps`: todos los toques; `dots`, los que se ven (los últimos).
  const [{ taps, dots }, setHeat] = useState<{ taps: number; dots: readonly Dot[] }>({ taps: 0, dots: [] })
  const touched = taps > 0

  const tap = (event: ReactPointerEvent<HTMLDivElement>) => {
    const box = event.currentTarget.getBoundingClientRect()
    if (!box.width || !box.height) return
    const x = ((event.clientX - box.left) / box.width) * 100
    const y = ((event.clientY - box.top) / box.height) * 100
    haptic('tap')
    setHeat((current) => ({ taps: current.taps + 1, dots: [...current.dots, { id: current.taps + 1, x, y }].slice(-MAX_DOTS) }))
  }

  return (
    <div className={`scene scene--stats ${touched ? 'is-redacted' : ''}`}>
      <p className="scene__stats-label">{touched ? copy.sent : copy.seen}</p>
      <div className="scene__screen scene__stats-screen" onPointerDown={tap}>
        <ul className="scene__list scene__list--plain">
          {copy.rows.map((row) => (
            <li key={row.title} className="scene__row">
              <span className="row__check" aria-hidden="true" />
              <span className="scene__row-main">
                <span className="row__title">
                  <span className="scene__words">{row.title}</span>
                </span>
                <span className="scene__meta">
                  <span className="scene__words">{row.meta}</span>
                </span>
              </span>
            </li>
          ))}
        </ul>
        {dots.map((dot) => (
          <i key={dot.id} className="scene__heat" style={{ left: `${dot.x}%`, top: `${dot.y}%` } as CSSProperties} aria-hidden="true" />
        ))}
        {!touched &&
          GHOST_TAPS.map(([x, y], index) => (
            <i
              key={index}
              className="scene__ghost-tap"
              style={{ left: `${x}%`, top: `${y}%`, '--d': `${index * GHOST_STEP_MS}ms` } as CSSProperties}
              aria-hidden="true"
            />
          ))}
      </div>
      <p className="scene__stats-count" aria-live="polite">
        {touched ? copy.taps(taps) : copy.hint}
      </p>
    </div>
  )
}
