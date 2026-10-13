import { useCurrentDay } from '../../hooks/useToday'
import { reminderLabel, snoozeOptions } from '../../lib/reminders'
import { useCopy } from '../../state/LanguageProvider'
import { useDispatch } from '../../state/StoreProvider'
import { isOverdue } from '../../state/selectors'
import type { Task } from '../../types'
import { IconArrowUp } from '../ui/Icons'
import { useToast } from '../ui/Toast'
import { useTaskActions } from './useTaskActions'

const COPY = {
  es: { snooze: 'Posponer', reminder: (label: string) => `Aviso: ${label}`, undo: 'Deshacer', toToday: 'A hoy' },
  en: { snooze: 'Snooze', reminder: (label: string) => `Reminder: ${label}`, undo: 'Undo', toToday: 'To today' },
} as const

interface SnoozeBarProps {
  task: Task
  onDone: () => void
}

/**
 * Lo primero que se ve al abrir una tarea desde su aviso: posponerlo (con "Deshacer") y, si la tarea es
 * de un día que ya pasó, pasarla a hoy. Tacharla es el círculo del título, como siempre.
 */
export function SnoozeBar({ task, onDone }: SnoozeBarProps) {
  const dispatch = useDispatch()
  const toast = useToast()
  const copy = useCopy(COPY)
  const today = useCurrentDay()
  const { toToday } = useTaskActions()

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
