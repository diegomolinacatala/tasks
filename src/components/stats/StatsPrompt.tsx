import { useEffect, useState } from 'react'
import { todayIso } from '../../lib/date'
import { haptic } from '../../lib/platform/feedback'
import { shouldAskStats } from '../../lib/stats/settings'
import type { StatsLevel } from '../../types'
import { useCopy } from '../../state/LanguageProvider'
import { useAppState, useDispatch } from '../../state/StoreProvider'
import { Sheet } from '../ui/Sheet'
import { STATS_CHOICES, STATS_CHOICE_COPY } from './choices'
import './stats.css'

const COPY = {
  es: {
    sheet: 'Estadísticas',
    kicker: 'Estadísticas anónimas',
    title: '¿Me ayudas a mejorar Tasks?',
    lead: 'Si quieres, Tasks contará de forma anónima cuántas veces se abre y qué pantallas ves; con detalle, también qué funciones usas y dónde tocas la pantalla. Hasta que elijas, no cuenta nada.',
    points: [
      'Nunca lo que escribes, ni tus tareas ni tus lugares.',
      'Sin cuentas ni identificadores: solo contadores.',
      'Se cambia cuando quieras, en Ajustes.',
    ],
    ...STATS_CHOICE_COPY.es,
  },
  en: {
    sheet: 'Statistics',
    kicker: 'Anonymous statistics',
    title: 'Help me make Tasks better?',
    lead: 'If you like, Tasks will anonymously count how often it opens and which screens you see; with details, also which features you use and where you tap the screen. Until you choose, nothing is counted.',
    points: [
      'Never what you write, your tasks or your places.',
      'No accounts, no identifiers: just counters.',
      'Change it anytime in Settings.',
    ],
    ...STATS_CHOICE_COPY.en,
  },
} as const

/** Se pregunta a partir del segundo día con la app: el primero es para conocerla. */
const SINCE_KEY = 'tasks:stats-ask'
/** Después de abrir (y de la ficha de versión nueva, que mira a los 3 s). */
const ASK_DELAY_MS = 6000

function secondDay(): boolean {
  try {
    const since = localStorage.getItem(SINCE_KEY)
    if (since) return todayIso() > since
    localStorage.setItem(SINCE_KEY, todayIso())
  } catch {
    // Sin almacenamiento, se pregunta igual otro día (no hay cómo saber cuál).
  }
  return false
}

/** Algo abierto delante (un panel, la cesta): la ficha espera a otro momento. */
const somethingOpen = () => {
  const root = document.documentElement.classList
  return root.contains('has-sheet') || root.contains('has-popover')
}

interface StatsPromptProps {
  /** La bienvenida, el modo sugerencia, la barra de escribir o un panel: espera. */
  paused: boolean
}

/**
 * Una vez por dispositivo, a partir del segundo día: pregunta si se cuentan estadísticas y cuáles. Hasta
 * que se elige no se cuenta nada, ni siquiera la respuesta (Apple pide permiso incluso para datos de uso
 * anónimos), y las tres respuestas pesan lo mismo: decir que no cuesta lo que decir que sí.
 */
export function StatsPrompt({ paused }: StatsPromptProps) {
  const copy = useCopy(COPY)
  const { stats } = useAppState().settings
  const dispatch = useDispatch()
  const [open, setOpen] = useState(false)
  const asking = shouldAskStats(stats)

  // Mientras algo la tapa (`paused`) no se cuenta el tiempo: al quitarse, vuelve a esperar, para no salir
  // de golpe justo al cerrar la barra o un panel. Si al cumplirse hay otro panel abierto, lo intenta después.
  useEffect(() => {
    if (!asking || paused) return
    let timer = 0
    const attempt = () => {
      if (!secondDay()) return
      if (somethingOpen()) timer = window.setTimeout(attempt, ASK_DELAY_MS)
      else setOpen(true)
    }
    timer = window.setTimeout(attempt, ASK_DELAY_MS)
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return
      window.clearTimeout(timer)
      timer = window.setTimeout(attempt, ASK_DELAY_MS)
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.clearTimeout(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [asking, paused])

  if (!asking) return null

  const choose = (level: StatsLevel) => {
    haptic(level === 'full' ? 'success' : 'selection')
    dispatch({ type: 'settings/stats', level })
    setOpen(false)
  }

  const footer = (
    <div className="stats-prompt__actions">
      {STATS_CHOICES.map((level) => (
        <button key={level} type="button" className="stats-prompt__choice" onClick={() => choose(level)}>
          {copy[level]}
        </button>
      ))}
    </div>
  )

  return (
    // Cerrarla sin elegir es "No, gracias": no se cuenta nada y no vuelve a preguntar.
    <Sheet
      screen="stats-consent"
      open={open && !paused}
      onClose={() => {
        dispatch({ type: 'settings/stats', level: 'off' })
        setOpen(false)
      }}
      title={copy.sheet}
      footer={footer}
    >
      <div className="stats-prompt">
        <span className="stats-prompt__art" aria-hidden="true">
          <i />
          <i />
          <i />
        </span>
        <p className="stats-prompt__kicker">{copy.kicker}</p>
        <h2 className="stats-prompt__title">{copy.title}</h2>
        <p className="stats-prompt__lead">{copy.lead}</p>
        <ul className="stats-prompt__points">
          {copy.points.map((point) => (
            <li key={point}>{point}</li>
          ))}
        </ul>
      </div>
    </Sheet>
  )
}
