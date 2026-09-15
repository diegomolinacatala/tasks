import { useEffect, useRef } from 'react'
import { haptic } from '../../lib/platform/feedback'
import { reminderLabel, snoozeOptions } from '../../lib/reminders'
import { useAppState, useDispatch } from '../../state/StoreProvider'
import type { Task } from '../../types'
import { useToast } from '../ui/Toast'
import { useNotificationOpen } from './useNotificationOpen'

interface NotificationHandlers {
  onOpenTask: (taskId: string) => void
  /** Aviso de lugar con varias tareas: se enseñan todas juntas. */
  onOpenPlace: (placeId: string) => void
}

/**
 * Qué hacer al tocar un aviso: los botones "Hecha" y "+10 min" se aplican directamente;
 * tocar el aviso sin más abre la tarea para decidir.
 */
export function useNotificationActions({ onOpenTask, onOpenPlace }: NotificationHandlers) {
  const state = useAppState()
  const dispatch = useDispatch()
  const toast = useToast()
  const tasks = useRef(state.tasks)

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

  useNotificationOpen(({ action, taskIds, placeId }) => {
    // Las que se borraron después de programar el aviso ya no cuentan.
    const found = taskIds.flatMap((id) => tasks.current.find((task) => task.id === id) ?? [])
    const [first] = found

    if (found.length === 1 && first && action === 'done') return complete(first)
    if (found.length === 1 && first && action === 'snooze') return snooze(first)
    if (found.length === 1 && first) return onOpenTask(first.id)
    if (placeId && found.length > 1) onOpenPlace(placeId)
  })
}
