import { useEffect, useRef } from 'react'
import { reminderLabel, snoozeOptions } from '../../lib/reminders'
import { useAppState, useDispatch } from '../../state/StoreProvider'
import { useToast } from '../ui/Toast'
import { useNotificationOpen } from './useNotificationOpen'

/**
 * Qué hacer al tocar un aviso: los botones "Hecha" y "+10 min" se aplican directamente
 * (Android, escritorio); tocar el aviso sin más abre la tarea para decidir (iPhone).
 */
export function useNotificationActions(onOpen: (taskId: string) => void) {
  const state = useAppState()
  const dispatch = useDispatch()
  const toast = useToast()
  const tasks = useRef(state.tasks)

  useEffect(() => {
    tasks.current = state.tasks
  }, [state.tasks])

  useNotificationOpen((taskId, action) => {
    const task = tasks.current.find((item) => item.id === taskId)
    // Si se borró después de programar el aviso, no hay nada que abrir.
    if (!task) return

    if (action === 'done') {
      if (task.done) return
      dispatch({ type: 'task/toggle', id: task.id })
      toast({
        message: `Hecha: ${task.title}`,
        actionLabel: 'Deshacer',
        onAction: () => dispatch({ type: 'task/toggle', id: task.id }),
      })
      return
    }

    if (action === 'snooze') {
      const now = Date.now()
      const [soon] = snoozeOptions(now)
      if (!soon) return
      dispatch({ type: 'task/snooze', id: task.id, at: soon.at, now })
      toast({ message: `Aviso: ${reminderLabel({ kind: 'at', at: soon.at }, now)}` })
      return
    }

    onOpen(task.id)
  })
}
