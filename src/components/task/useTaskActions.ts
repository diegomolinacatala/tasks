import { useCallback, useMemo, useRef } from 'react'
import { todayIso } from '../../lib/date'
import { placementsOf } from '../../lib/order'
import { pick } from '../../lib/i18n'
import { haptic } from '../../lib/platform/feedback'
import { withTransition } from '../../lib/transition'
import { useAppState, useDispatch } from '../../state/StoreProvider'
import { overdueTasks } from '../../state/selectors'
import { useToast } from '../ui/Toast'

const TEXT = {
  es: {
    removed: 'Tarea borrada',
    undo: 'Deshacer',
    movedOne: (title: string) => `A hoy: ${title}`,
    moved: (count: number) => `${count} tareas pasadas a hoy`,
    routineRemoved: 'Rutina borrada',
  },
  en: {
    removed: 'Task deleted',
    undo: 'Undo',
    movedOne: (title: string) => `To today: ${title}`,
    moved: (count: number) => `${count} tasks moved to today`,
    routineRemoved: 'Routine deleted',
  },
} as const

/**
 * Completar, borrar, pasar a hoy, la importancia y las rutinas. Las funciones no cambian entre
 * renders (leen el estado de un ref): las filas memorizadas no se repintan por ellas.
 */
export function useTaskActions() {
  const state = useAppState()
  const dispatch = useDispatch()
  const toast = useToast()
  const latest = useRef(state)
  latest.current = state

  const toggle = useCallback(
    (id: string) => {
      // Completar se nota más que desmarcar.
      haptic(latest.current.tasks.find((item) => item.id === id)?.done ? 'tap' : 'success')
      dispatch({ type: 'task/toggle', id })
    },
    [dispatch],
  )

  const remove = useCallback(
    (id: string) => {
      const task = latest.current.tasks.find((item) => item.id === id)
      if (!task) return
      dispatch({ type: 'task/remove', id })
      haptic('warning')
      const text = pick(TEXT)
      toast({
        message: text.removed,
        actionLabel: text.undo,
        onAction: () => dispatch({ type: 'task/restore', task }),
      })
    },
    [dispatch, toast],
  )

  /**
   * Pasa a hoy esas tareas o, sin `ids`, todo lo atrasado: arriba de su sección, con "Deshacer"
   * que las devuelve a su día y su sitio.
   */
  const toToday = useCallback(
    (ids?: readonly string[]) => {
      const current = latest.current
      const today = todayIso()
      const candidates = ids ?? overdueTasks(current, today).map((task) => task.id)
      // En el orden recibido (lo atrasado, de lo más antiguo a lo más reciente): así quedan en hoy.
      const moving = candidates.flatMap((id) => {
        const task = current.tasks.find((item) => item.id === id)
        return task && !task.done && task.date !== today ? [task] : []
      })
      const [first] = moving
      if (!first) return
      const before = placementsOf(current.tasks, moving.map((task) => task.id))
      withTransition(() => dispatch({ type: 'tasks/reschedule', ids: moving.map((task) => task.id), date: today }))
      haptic('success')
      const text = pick(TEXT)
      toast({
        message: moving.length === 1 ? text.movedOne(first.title) : text.moved(moving.length),
        actionLabel: text.undo,
        onAction: () => withTransition(() => dispatch({ type: 'tasks/place', placements: before })),
      })
    },
    [dispatch, toast],
  )

  const setImportance = useCallback(
    (id: string, importance: number) => dispatch({ type: 'task/importance', id, importance }),
    [dispatch],
  )

  /** Tachar o destachar una rutina ese día. */
  const toggleRoutine = useCallback(
    (id: string, date: string) => {
      const routine = latest.current.routines.find((item) => item.id === id)
      if (!routine) return
      haptic(routine.done.includes(date) ? 'tap' : 'success')
      dispatch({ type: 'routine/toggle', id, date })
    },
    [dispatch],
  )

  const removeRoutine = useCallback(
    (id: string) => {
      const routine = latest.current.routines.find((item) => item.id === id)
      if (!routine) return
      dispatch({ type: 'routine/remove', id })
      haptic('warning')
      const text = pick(TEXT)
      toast({
        message: text.routineRemoved,
        actionLabel: text.undo,
        onAction: () => dispatch({ type: 'routine/restore', routine }),
      })
    },
    [dispatch, toast],
  )

  return useMemo(
    () => ({ toggle, remove, toToday, setImportance, toggleRoutine, removeRoutine }),
    [toggle, remove, toToday, setImportance, toggleRoutine, removeRoutine],
  )
}
