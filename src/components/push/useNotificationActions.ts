import { useEffect, useRef } from 'react'
import { shortTime } from '../../lib/date'
import { endClock, extendedDuration } from '../../lib/duration'
import { haptic } from '../../lib/platform/feedback'
import { reminderLabel, snoozeOptions } from '../../lib/reminders'
import { useAppState, useDispatch } from '../../state/StoreProvider'
import type { Task } from '../../types'
import { useTaskActions } from '../task/useTaskActions'
import { useToast } from '../ui/Toast'
import { useNotificationOpen } from './useNotificationOpen'

interface NotificationHandlers {
  onOpenTask: (taskId: string) => void
  /** Aviso de lugar con varias tareas: se enseñan todas juntas. */
  onOpenPlace: (placeId: string) => void
}

/**
 * Qué hacer al tocar un aviso: los botones "Hecha", "+10 min" y "Pasar a hoy" se aplican
 * directamente; tocar el aviso sin más abre la tarea para decidir. El aviso de cierre pregunta
 * si ya está hecha: "Sí" la tacha, "Todavía no" alarga la tarea y vuelve a preguntar, y tocarlo
 * sin botón repite la pregunta en un aviso de la propia app, para acabar en un solo toque.
 */
export function useNotificationActions({ onOpenTask, onOpenPlace }: NotificationHandlers) {
  const state = useAppState()
  const dispatch = useDispatch()
  const toast = useToast()
  const { toToday } = useTaskActions()
  const tasks = useRef(state.tasks)
  // El aviso puede llegar antes de que se pinte el estado nuevo: siempre la última versión.
  const moveToToday = useRef(toToday)

  useEffect(() => {
    moveToToday.current = toToday
  }, [toToday])

  useEffect(() => {
    tasks.current = state.tasks
  }, [state.tasks])

  const complete = (task: Task) => {
    if (task.done) return
    dispatch({ type: 'task/toggle', id: task.id })
    haptic('success')
    toast({
      message: `Hecha: ${task.title}`,
      actionLabel: 'Deshacer',
      onAction: () => dispatch({ type: 'task/toggle', id: task.id }),
    })
  }

  const snooze = (task: Task) => {
    const now = Date.now()
    const [soon] = snoozeOptions(now)
    if (!soon) return
    dispatch({ type: 'task/snooze', id: task.id, at: soon.at, now })
    toast({ message: `Aviso: ${reminderLabel({ kind: 'at', at: soon.at }, now)}` })
  }

  /** "Todavía no": la tarea se alarga, así que la pregunta vuelve dentro de un rato. */
  const extend = (task: Task) => {
    const now = Date.now()
    const duration = extendedDuration(task, now)
    if (duration === null || !task.time) return onOpenTask(task.id)
    dispatch({ type: 'task/extend', id: task.id, now })
    haptic('tap')
    toast({ message: `Vuelvo a preguntar a las ${shortTime(endClock(task.time, duration))}` })
  }

  /** La misma pregunta del aviso, ya dentro de la app: un toque en "Sí" y está hecha. */
  const askAgain = (task: Task) => {
    if (task.done) return
    toast({ message: `¿Has acabado ${task.title}?`, actionLabel: 'Sí', onAction: () => complete(task) })
  }

  useNotificationOpen(({ action, taskIds, placeId, ask }) => {
    // Las que se borraron después de programar el aviso ya no cuentan.
    const found = taskIds.flatMap((id) => tasks.current.find((task) => task.id === id) ?? [])
    const [first] = found

    // Sin tarea es el resumen diario: todo lo atrasado.
    if (action === 'today' && !placeId) return moveToToday.current(taskIds.length ? found.map((task) => task.id) : undefined)
    if (found.length === 1 && first && action === 'done') return complete(first)
    if (found.length === 1 && first && action === 'snooze') return snooze(first)
    if (found.length === 1 && first && action === 'again') return extend(first)
    if (found.length === 1 && first) return ask ? askAgain(first) : onOpenTask(first.id)
    if (placeId && found.length > 1) onOpenPlace(placeId)
  })
}
