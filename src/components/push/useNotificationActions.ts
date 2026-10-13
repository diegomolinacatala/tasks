import { useEffect, useRef } from 'react'
import { shortTime } from '../../lib/date'
import { endClock, extendedDuration } from '../../lib/duration'
import { pick } from '../../lib/i18n'
import { haptic } from '../../lib/platform/feedback'
import { reminderLabel, snoozeOptions } from '../../lib/reminders'
import { useAppState, useDispatch } from '../../state/StoreProvider'
import type { NotificationEvent } from '../../lib/nativeEvents'
import type { Task } from '../../types'
import { useTaskActions } from '../task/useTaskActions'
import { useToast } from '../ui/Toast'
import { useNotificationOpen } from './useNotificationOpen'

const TEXT = {
  es: {
    done: (title: string) => `Hecha: ${title}`,
    undo: 'Deshacer',
    doneQuestion: (title: string) => `¿Hecha: ${title}?`,
    yes: 'Sí',
    reminder: (label: string) => `Aviso: ${label}`,
    again: (clock: string) => `Vuelvo a preguntar a las ${clock}`,
    finished: (title: string) => `¿Has acabado ${title}?`,
    gone: 'Esa tarea ya no está.',
    alreadyDone: (title: string) => `Ya estaba hecha: ${title}`,
    nothingOverdue: 'No queda nada atrasado.',
  },
  en: {
    done: (title: string) => `Done: ${title}`,
    undo: 'Undo',
    doneQuestion: (title: string) => `Done: ${title}?`,
    yes: 'Yes',
    reminder: (label: string) => `Reminder: ${label}`,
    again: (clock: string) => `I’ll ask again at ${clock}`,
    finished: (title: string) => `Finished ${title}?`,
    gone: 'That task is gone.',
    alreadyDone: (title: string) => `Already done: ${title}`,
    nothingOverdue: 'Nothing overdue left.',
  },
} as const

interface NotificationHandlers {
  onOpenTask: (taskId: string) => void
  /** Aviso de lugar con varias tareas: se enseñan todas juntas. */
  onOpenPlace: (placeId: string) => void
  /** Aviso de una rutina tocado sin botón: se va a la Bandeja, donde están. */
  onOpenRoutine: (routineId: string) => void
  /** El resumen diario (tocado o tras pasar lo atrasado a hoy): la Agenda, en hoy. */
  onOpenToday: () => void
  /** Hay algo delante (la bienvenida de novedades): el aviso espera a que se cierre. */
  paused?: boolean
}

/**
 * Qué hacer al tocar un aviso: los botones "Hecha", "+10 min" y "Pasar a hoy" se aplican
 * directamente; tocar el aviso sin más abre la tarea para decidir. El aviso de cierre pregunta
 * si ya está hecha: "Sí" la tacha, "Todavía no" alarga la tarea y vuelve a preguntar, y tocarlo
 * sin botón repite la pregunta en un aviso de la propia app, para acabar en un solo toque.
 */
export function useNotificationActions({ onOpenTask, onOpenPlace, onOpenRoutine, onOpenToday, paused = false }: NotificationHandlers) {
  const state = useAppState()
  const dispatch = useDispatch()
  const toast = useToast()
  const { toToday } = useTaskActions()
  const tasks = useRef(state.tasks)
  const routines = useRef(state.routines)
  // El aviso puede llegar antes de que se pinte el estado nuevo: siempre la última versión.
  const moveToToday = useRef(toToday)

  useEffect(() => {
    moveToToday.current = toToday
  }, [toToday])

  useEffect(() => {
    tasks.current = state.tasks
    routines.current = state.routines
  }, [state.tasks, state.routines])

  /** "Hecha" en el aviso de una rutina, o tocarlo: se tacha ese día, o se pregunta en la app. */
  const answerRoutine = (routineId: string, date: string, action: string) => {
    const routine = routines.current.find((item) => item.id === routineId)
    if (!routine) return
    const markDone = () => {
      dispatch({ type: 'routine/set', id: routine.id, date, done: true })
      haptic('success')
    }
    if (action === 'done') {
      markDone()
      const text = pick(TEXT)
      toast({
        message: text.done(routine.title),
        actionLabel: text.undo,
        onAction: () => dispatch({ type: 'routine/set', id: routine.id, date, done: false }),
      })
      return
    }
    onOpenRoutine(routine.id)
    if (!routine.done.includes(date)) toast({ message: pick(TEXT).doneQuestion(routine.title), actionLabel: pick(TEXT).yes, onAction: markDone })
  }

  const complete = (task: Task) => {
    if (task.done) return toast({ message: pick(TEXT).alreadyDone(task.title) })
    dispatch({ type: 'task/toggle', id: task.id })
    haptic('success')
    const text = pick(TEXT)
    toast({
      message: text.done(task.title),
      actionLabel: text.undo,
      onAction: () => dispatch({ type: 'task/toggle', id: task.id }),
    })
  }

  const snooze = (task: Task) => {
    // Posponer una hecha crearía un aviso que nunca sonará.
    if (task.done) return toast({ message: pick(TEXT).alreadyDone(task.title) })
    const now = Date.now()
    const [soon] = snoozeOptions(now)
    if (!soon) return
    dispatch({ type: 'task/snooze', id: task.id, at: soon.at, now })
    toast({ message: pick(TEXT).reminder(reminderLabel({ kind: 'at', at: soon.at }, now)) })
  }

  /** "Todavía no": la tarea se alarga, así que la pregunta vuelve dentro de un rato. */
  const extend = (task: Task) => {
    const now = Date.now()
    const duration = extendedDuration(task, now)
    if (duration === null || !task.time) return onOpenTask(task.id)
    dispatch({ type: 'task/extend', id: task.id, now })
    haptic('tap')
    toast({ message: pick(TEXT).again(shortTime(endClock(task.time, duration))) })
  }

  /**
   * La misma pregunta del aviso, ya dentro de la app: se abre la tarea (su barra de arriba lleva "Sí,
   * hecha" y "Todavía no") y un aviso con "Sí" por si basta un toque.
   */
  const askAgain = (task: Task) => {
    if (task.done) return toast({ message: pick(TEXT).alreadyDone(task.title) })
    onOpenTask(task.id)
    toast({
      message: pick(TEXT).finished(task.title),
      actionLabel: pick(TEXT).yes,
      // La tarea tal como esté al tocar "Sí": si ya se tachó desde el panel, no se destacha.
      onAction: () => {
        const current = tasks.current.find((item) => item.id === task.id)
        if (current) complete(current)
      },
    })
  }

  const handle = (event: NotificationEvent) => {
    const { action, taskIds, placeId, ask, routine } = event
    const text = pick(TEXT)
    if (routine) return answerRoutine(routine.id, routine.date, action)
    // Las que se borraron después de programar el aviso ya no cuentan.
    const found = taskIds.flatMap((id) => tasks.current.find((task) => task.id === id) ?? [])
    const [first] = found

    // Sin tarea es el resumen diario: todo lo atrasado, y la Agenda en hoy.
    if (action === 'today' && !placeId) {
      const moved = moveToToday.current(taskIds.length ? found.map((task) => task.id) : undefined)
      if (!moved) toast({ message: text.nothingOverdue })
      return onOpenToday()
    }
    if (!taskIds.length && !placeId) return onOpenToday()
    // El aviso siguió en el centro de notificaciones después de borrar la tarea: se dice, en vez de no hacer nada.
    if (!found.length) return toast({ message: text.gone })
    if (found.length === 1 && first && action === 'done') return complete(first)
    if (found.length === 1 && first && action === 'snooze') return snooze(first)
    if (found.length === 1 && first && action === 'again') return extend(first)
    if (found.length === 1 && first) return ask ? askAgain(first) : onOpenTask(first.id)
    if (placeId && found.length > 1) onOpenPlace(placeId)
  }

  // Con algo delante (la bienvenida de novedades), el toque espera a que se cierre: su aviso no se pierde.
  const pending = useRef<NotificationEvent | null>(null)
  const handler = useRef(handle)
  handler.current = handle
  const isPaused = useRef(paused)
  isPaused.current = paused

  useEffect(() => {
    if (paused || !pending.current) return
    const event = pending.current
    pending.current = null
    handler.current(event)
  }, [paused])

  useNotificationOpen((event) => {
    if (isPaused.current) pending.current = event
    else handler.current(event)
  })
}
