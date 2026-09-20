import { useCallback } from 'react'
import { todayIso } from '../../lib/date'
import { placementsOf } from '../../lib/order'
import { haptic } from '../../lib/platform/feedback'
import { withTransition } from '../../lib/transition'
import { useAppState, useDispatch } from '../../state/StoreProvider'
import { overdueTasks } from '../../state/selectors'
import { useToast } from '../ui/Toast'

export function useTaskActions() {
  const state = useAppState()
  const dispatch = useDispatch()
  const toast = useToast()

  const toggle = useCallback(
    (id: string) => {
      // Completar se nota más que desmarcar.
      haptic(state.tasks.find((item) => item.id === id)?.done ? 'tap' : 'success')
      dispatch({ type: 'task/toggle', id })
    },
    [state.tasks, dispatch],
  )

  const remove = useCallback(
    (id: string) => {
      const task = state.tasks.find((item) => item.id === id)
      if (!task) return
      dispatch({ type: 'task/remove', id })
      haptic('warning')
      toast({
        message: 'Tarea borrada',
        actionLabel: 'Deshacer',
        onAction: () => dispatch({ type: 'task/restore', task }),
      })
    },
    [state.tasks, dispatch, toast],
  )

  /**
   * Pasa a hoy esas tareas o, sin `ids`, todo lo atrasado: arriba de su sección, con "Deshacer"
   * que las devuelve a su día y su sitio.
   */
  const toToday = useCallback(
    (ids?: readonly string[]) => {
      const today = todayIso()
      const candidates = ids ?? overdueTasks(state, today).map((task) => task.id)
      // En el orden recibido (lo atrasado, de lo más antiguo a lo más reciente): así quedan en hoy.
      const moving = candidates.flatMap((id) => {
        const task = state.tasks.find((item) => item.id === id)
        return task && !task.done && task.date !== today ? [task] : []
      })
      const [first] = moving
      if (!first) return
      const before = placementsOf(state.tasks, moving.map((task) => task.id))
      withTransition(() => dispatch({ type: 'tasks/reschedule', ids: moving.map((task) => task.id), date: today }))
      haptic('success')
      toast({
        message: moving.length === 1 ? `A hoy: ${first.title}` : `${moving.length} tareas pasadas a hoy`,
        actionLabel: 'Deshacer',
        onAction: () => withTransition(() => dispatch({ type: 'tasks/place', placements: before })),
      })
    },
    [state, dispatch, toast],
  )

  const setImportance = useCallback(
    (id: string, importance: number) => dispatch({ type: 'task/importance', id, importance }),
    [dispatch],
  )

  return { toggle, remove, toToday, setImportance }
}
