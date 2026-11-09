import { useState } from 'react'
import { haptic } from '../../lib/platform/feedback'
import { effectiveLevel } from '../../lib/stats/settings'
import type { StatsLevel } from '../../types'
import { useCopy } from '../../state/LanguageProvider'
import { useAppState, useDispatch } from '../../state/StoreProvider'
import { IconCheck } from '../ui/Icons'
import { Sheet } from '../ui/Sheet'
import { SettingsRow, SettingsSheetTitle } from './SettingsRow'
import '../stats/stats.css'

const API = import.meta.env.VITE_PUSH_API

const COPY = {
  es: {
    title: 'Estadísticas',
    levels: {
      full: ['Con detalle', 'Visitas, qué funciones se usan y dónde se toca la pantalla.'],
      basic: ['Solo visitas', 'Cuántas veces se abre la app, qué pantallas, cuánto tarda en abrir y sus errores.'],
      off: ['Ninguna', 'No se envía nada.'],
    },
    never: 'Nunca se envía lo que escribes, tus tareas, tus lugares ni nada que te identifique: ni una cuenta, ni un número del dispositivo. El servidor solo suma contadores.',
    more: 'Cómo funcionan',
    page: 'privacidad.html#estadisticas',
  },
  en: {
    title: 'Statistics',
    levels: {
      full: ['Detailed', 'Visits, which features get used and where the screen is tapped.'],
      basic: ['Visits only', 'How often the app opens, which screens, how long it takes to open and its errors.'],
      off: ['None', 'Nothing is sent.'],
    },
    never: 'What you write, your tasks, your places or anything that identifies you is never sent: no account, no device number. The server only adds up counters.',
    more: 'How they work',
    page: 'privacy.html#statistics',
  },
} as const

const LEVELS: readonly StatsLevel[] = ['full', 'basic', 'off']
const SITE = 'https://diegomolinacatala.github.io/tasks/'

/**
 * Ajustes → Estadísticas: qué manda este dispositivo, sin cuentas ni identificadores. Sin servidor no
 * hay a quién mandar nada y la fila no sale.
 */
export function StatsRow() {
  const copy = useCopy(COPY)
  const stats = useAppState().settings.stats
  const dispatch = useDispatch()
  const [open, setOpen] = useState(false)
  const level = effectiveLevel(stats)

  if (!API) return null

  return (
    <>
      <SettingsRow icon={<IconStats size={17} />} label={copy.title} value={copy.levels[level][0]} onClick={() => setOpen(true)} />
      <Sheet screen="stats" open={open} onClose={() => setOpen(false)} title={copy.title}>
        <SettingsSheetTitle>{copy.title}</SettingsSheetTitle>
        <div className="group__card" role="radiogroup" aria-label={copy.title}>
          {LEVELS.map((option) => {
            const active = option === level
            const [label, note] = copy.levels[option]
            return (
              <button
                key={option}
                type="button"
                role="radio"
                aria-checked={active}
                className={`group__row language__option stats-option ${active ? 'is-active' : ''}`}
                onClick={() => {
                  haptic('selection')
                  dispatch({ type: 'settings/stats', level: option })
                }}
              >
                <span className="stats-option__text">
                  <span className="group__label">{label}</span>
                  <span className="stats-option__note">{note}</span>
                </span>
                <span className="language__check" aria-hidden="true">
                  <IconCheck size={15} strokeWidth={2.4} />
                </span>
              </button>
            )
          })}
        </div>
        <p className="group__note settings-sheet__text">{copy.never}</p>
        <p className="group__note settings-sheet__text">
          <a href={`${SITE}${copy.page}`} target="_blank" rel="noopener noreferrer">
            {copy.more}
          </a>
        </p>
      </Sheet>
    </>
  )
}

/** Unas barras de distinto alto: lo que se cuenta, sin nombres. */
function IconStats({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" aria-hidden="true">
      <path d="M5 19.5V13M10 19.5V8M15 19.5V11M20 19.5V5" />
      <path d="M3.5 19.5h17" opacity={0.55} />
    </svg>
  )
}
