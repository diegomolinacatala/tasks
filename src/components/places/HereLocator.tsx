import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { isNative } from '../../lib/platform'
import { haptic } from '../../lib/platform/feedback'
import { HERE_PIN_WINDOW_MS } from '../../lib/reminders'
import { useCopy } from '../../state/LanguageProvider'
import { useAppState, useDispatch } from '../../state/StoreProvider'
import { useToast } from '../ui/Toast'

const COPY = {
  es: {
    offer: (title: string) => `«${title}»: ¿avisarte al alejarte de aquí?`,
    yes: 'Sí',
    noLocation: (title: string) => `«${title}» sin ubicar: el aviso no sonará.`,
    retry: 'Reintentar',
    settings: 'Abrir Ajustes',
  },
  en: {
    offer: (title: string) => `“${title}”: remind you once you move away from here?`,
    yes: 'Yes',
    noLocation: (title: string) => `“${title}” has no location: the reminder won’t go off.`,
    retry: 'Retry',
    settings: 'Open Settings',
  },
} as const

interface HereLocatorValue {
  /** Ids de los avisos "al alejarme" cuya posición se está pidiendo ahora mismo. */
  locating: ReadonlySet<string>
  /** Pide la posición y la fija en ese aviso. */
  locate: (taskId: string, reminderId: string) => void
}

const HereLocatorContext = createContext<HereLocatorValue>({ locating: new Set(), locate: () => undefined })

export const useHereLocator = (): HereLocatorValue => useContext(HereLocatorContext)

/** Los avisos viejos sin punto por los que ya se preguntó, por dispositivo: no se vuelve a preguntar en cada arranque. */
const OFFERED_KEY = 'tasks:here-offered'
const MAX_OFFERED = 50

function readOffered(): Set<string> {
  try {
    const raw = JSON.parse(localStorage.getItem(OFFERED_KEY) ?? '[]')
    return new Set(Array.isArray(raw) ? raw.filter((id): id is string => typeof id === 'string') : [])
  } catch {
    return new Set()
  }
}

function writeOffered(ids: ReadonlySet<string>): void {
  try {
    localStorage.setItem(OFFERED_KEY, JSON.stringify([...ids].slice(-MAX_OFFERED)))
  } catch {
    // Sin almacenamiento se preguntará otra vez en el próximo arranque: mejor eso que nada.
  }
}

/**
 * Fija dónde se está en los avisos "al alejarme" que nacen sin punto (lo escrito, lo dictado, lo que
 * deja Siri con la app cerrada). Solo en el iPhone. Lo recién pedido se fija solo; lo de hace rato
 * (Siri hace horas, en otro sitio) se pregunta antes, porque "aquí" ya no sería el mismo sitio. Si no
 * hay posición, se dice y se ofrece reintentar (o abrir Ajustes si el permiso está negado).
 */
export function HereLocatorProvider({ children }: { children: ReactNode }) {
  const state = useAppState()
  const dispatch = useDispatch()
  const toast = useToast()
  const copy = useCopy(COPY)
  const [locating, setLocating] = useState<ReadonlySet<string>>(() => new Set())
  // Lo ya atendido en esta sesión (fijado, ofrecido o fallido) y lo ofrecido en cualquier arranque.
  const handled = useRef(new Set<string>())
  const offered = useRef<Set<string> | null>(null)
  const tasks = useRef(state.tasks)
  tasks.current = state.tasks

  const locate = useCallback(
    (taskId: string, reminderId: string) => {
      handled.current.add(reminderId)
      setLocating((current) => new Set([...current, reminderId]))
      void (async () => {
        const { TasksNative } = await import('../../lib/platform/native')
        try {
          const { lat, lng, accuracy } = await TasksNative.currentPosition()
          dispatch({ type: 'reminder/here', taskId, reminderId, from: { lat, lng, accuracy }, now: Date.now() })
          haptic('success')
        } catch {
          const title = tasks.current.find((task) => task.id === taskId)?.title ?? ''
          const { status } = await TasksNative.locationStatus().catch(() => ({ status: 'prompt' as const }))
          const denied = status === 'denied'
          toast({
            message: copy.noLocation(title),
            tone: 'error',
            actionLabel: denied ? copy.settings : copy.retry,
            onAction: () => (denied ? void TasksNative.openSettings() : locate(taskId, reminderId)),
          })
        } finally {
          setLocating((current) => {
            const next = new Set(current)
            next.delete(reminderId)
            return next
          })
        }
      })()
    },
    [dispatch, toast, copy],
  )

  useEffect(() => {
    if (!isNative) return
    const now = Date.now()
    offered.current ??= readOffered()
    for (const task of state.tasks) {
      if (task.done) continue
      for (const reminder of task.reminders) {
        if (reminder.kind !== 'here' || reminder.from || handled.current.has(reminder.id)) continue
        if (now - reminder.since <= HERE_PIN_WINDOW_MS) {
          locate(task.id, reminder.id)
          continue
        }
        // Se pidió hace rato (Siri con la app cerrada): "aquí" puede no ser ya el mismo sitio. Se pregunta
        // una vez por dispositivo y de uno en uno (dos toasts a la vez se pisan); el panel de la tarea
        // siempre deja fijarlo.
        handled.current.add(reminder.id)
        if (offered.current.has(reminder.id)) continue
        offered.current.add(reminder.id)
        writeOffered(offered.current)
        toast({ message: copy.offer(task.title), actionLabel: copy.yes, onAction: () => locate(task.id, reminder.id) })
        return
      }
    }
  }, [state.tasks, locate, toast, copy])

  const value = useMemo(() => ({ locating, locate }), [locating, locate])
  return <HereLocatorContext.Provider value={value}>{children}</HereLocatorContext.Provider>
}
