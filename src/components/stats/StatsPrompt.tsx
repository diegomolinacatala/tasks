import { useCallback, useEffect, useState } from 'react'
import { todayIso } from '../../lib/date'
import { haptic } from '../../lib/platform/feedback'
import { track } from '../../lib/stats/bus'
import { shouldAskStats } from '../../lib/stats/settings'
import type { StatsLevel } from '../../types'
import { useCopy } from '../../state/LanguageProvider'
import { useAppState, useDispatch } from '../../state/StoreProvider'
import { Sheet } from '../ui/Sheet'
import './stats.css'

const COPY = {
  es: {
    sheet: 'Estadísticas',
    kicker: 'Estadísticas anónimas',
    title: '¿Me ayudas a mejorar Tasks?',
    lead: 'Tasks cuenta las visitas sin saber de quién son. Si quieres, comparte también qué funciones usas y dónde tocas la pantalla.',
    points: [
      'Nunca lo que escribes, ni tus tareas ni tus lugares.',
      'Sin cuentas ni identificadores: solo contadores.',
      'Se cambia cuando quieras, en Ajustes.',
    ],
    yes: 'Sí, compartir el detalle',
    basic: 'Solo las visitas',
    none: 'No enviar nada',
  },
  en: {
    sheet: 'Statistics',
    kicker: 'Anonymous statistics',
    title: 'Help me make Tasks better?',
    lead: 'Tasks counts visits without knowing whose they are. If you like, also share which features you use and where you tap the screen.',
    points: [
      'Never what you write, your tasks or your places.',
      'No accounts, no identifiers: just counters.',
      'Change it anytime in Settings.',
    ],
    yes: 'Yes, share the details',
    basic: 'Visits only',
    none: 'Send nothing',
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
 * Una vez por dispositivo, a partir del segundo día: pide compartir el detalle (funciones y toques). Sin
 * elegir se queda en "solo visitas" (medir audiencia, que se puede quitar en Ajustes); cerrarla también.
 */
export function StatsPrompt({ paused }: StatsPromptProps) {
  const copy = useCopy(COPY)
  const { stats } = useAppState().settings
  const dispatch = useDispatch()
  const [open, setOpen] = useState(false)
  const asking = shouldAskStats(stats)

  const maybeOpen = useCallback(() => {
    if (asking && !somethingOpen() && secondDay()) setOpen(true)
  }, [asking])

  useEffect(() => {
    if (!asking) return
    const timer = window.setTimeout(maybeOpen, ASK_DELAY_MS)
    const onVisible = () => {
      if (document.visibilityState === 'visible') window.setTimeout(maybeOpen, ASK_DELAY_MS)
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.clearTimeout(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [asking, maybeOpen])

  if (!asking) return null

  const choose = (level: StatsLevel) => {
    haptic(level === 'full' ? 'success' : 'selection')
    track(level === 'full' ? 'ui/stats-yes' : level === 'basic' ? 'ui/stats-basic' : 'ui/stats-none')
    dispatch({ type: 'settings/stats', level })
    setOpen(false)
  }

  const footer = (
    <div className="stats-prompt__actions">
      <button type="button" className="sheet__primary" onClick={() => choose('full')}>
        {copy.yes}
      </button>
      <button type="button" className="stats-prompt__secondary" onClick={() => choose('basic')}>
        {copy.basic}
      </button>
      <button type="button" className="stats-prompt__quiet" onClick={() => choose('off')}>
        {copy.none}
      </button>
    </div>
  )

  return (
    // Cerrarla sin elegir es quedarse como estaba: solo las visitas, y no vuelve a preguntar.
    <Sheet screen="stats-consent" open={open && !paused} onClose={() => choose('basic')} title={copy.sheet} footer={footer}>
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
