import { useCurrentDay } from '../../hooks/useToday'
import { endClock, extendedDuration, taskEnd } from '../../lib/duration'
import { shortTime } from '../../lib/date'
import { haptic } from '../../lib/platform/feedback'
import { reminderLabel, snoozeOptions } from '../../lib/reminders'
import { useCopy } from '../../state/LanguageProvider'
import { useDispatch } from '../../state/StoreProvider'
import { isOverdue } from '../../state/selectors'
import type { Task } from '../../types'
import { IconArrowUp, IconCheck } from '../ui/Icons'
import { useToast } from '../ui/Toast'
import { useTaskActions } from './useTaskActions'

const COPY = {
  es: {
    snooze: 'Posponer',
    reminder: (label: string) => `Aviso: ${label}`,
    undo: 'Deshacer',
    toToday: 'A hoy',
    finished: '¿Has acabado?',
    yes: 'Sí, hecha',
    notYet: 'Todavía no',
    done: (title: string) => `Hecha: ${title}`,
    again: (clock: string) => `Vuelvo a preguntar a las ${clock}`,
  },
  en: {
    snooze: 'Snooze',
    reminder: (label: string) => `Reminder: ${label}`,
    undo: 'Undo',
    toToday: 'To today',
    finished: 'Finished?',
    yes: 'Yes, done',
    notYet: 'Not yet',
    done: (title: string) => `Done: ${title}`,
    again: (clock: string) => `I’ll ask again at ${clock}`,
  },
} as const

interface SnoozeBarProps {
  task: Task
  onDone: () => void
}

/**
 * Lo primero que se ve al abrir una tarea desde su aviso: posponerlo (con "Deshacer") y, si la tarea es
 * de un día que ya pasó, pasarla a hoy. Si tenía duración y ya acabó, la pregunta del aviso de cierre
 * ("¿Has acabado?" con "Sí, hecha" y "Todavía no") para que no se quede sin respuesta. Tacharla es el
 * círculo del título, como siempre.
 */
export function SnoozeBar({ task, onDone }: SnoozeBarProps) {
  const dispatch = useDispatch()
  const toast = useToast()
  const copy = useCopy(COPY)
  const today = useCurrentDay()
  const { toToday, toggle } = useTaskActions()
  const now = Date.now()
  const end = taskEnd(task)
  const ended = end !== null && end <= now

  const yes = () => {
    toggle(task.id)
    onDone()
    toast({ message: copy.done(task.title), actionLabel: copy.undo, onAction: () => toggle(task.id) })
  }

  /** "Todavía no": la tarea se alarga y la pregunta vuelve dentro de un rato. */
  const notYet = () => {
    const duration = extendedDuration(task, now)
    if (duration === null || !task.time) return
    dispatch({ type: 'task/extend', id: task.id, now })
    haptic('tap')
    toast({ message: copy.again(shortTime(endClock(task.time, duration))) })
    onDone()
  }

  const snooze = (at: number) => {
    const before = task
    dispatch({ type: 'task/snooze', id: task.id, at, now: Date.now() })
    toast({
      message: copy.reminder(reminderLabel({ kind: 'at', at }, Date.now())),
      actionLabel: copy.undo,
      // No hay acción que cambie los avisos de golpe: se vuelve a la tarea tal como estaba.
      onAction: () => {
        dispatch({ type: 'task/remove', id: before.id })
        dispatch({ type: 'task/restore', task: before })
      },
    })
    onDone()
  }

  return (
    <>
      {ended && (
        <>
          <p className="sheet__title">{copy.finished}</p>
          <div className="sheet__chips">
            <button type="button" className="chip chip--reminder" onClick={yes}>
              <IconCheck size={13} strokeWidth={2.5} />
              {copy.yes}
            </button>
            <button type="button" className="chip chip--option" onClick={notYet}>
              {copy.notYet}
            </button>
          </div>
        </>
      )}
      <p className="sheet__title">{copy.snooze}</p>
      <div className="sheet__chips">
        {isOverdue(task, today) && (
          <button
            type="button"
            className="chip chip--reminder"
            onClick={() => {
              toToday([task.id])
              onDone()
            }}
          >
            <IconArrowUp size={13} strokeWidth={2.2} />
            {copy.toToday}
          </button>
        )}
        {snoozeOptions(Date.now()).map((option) => (
          <button key={option.key} type="button" className="chip chip--option" onClick={() => snooze(option.at)}>
            {option.label}
          </button>
        ))}
      </div>
    </>
  )
}
