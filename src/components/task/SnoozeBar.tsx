import { reminderLabel, snoozeOptions } from '../../lib/reminders'
import { useCopy } from '../../state/LanguageProvider'
import { useDispatch } from '../../state/StoreProvider'
import type { Task } from '../../types'
import { IconCheck } from '../ui/Icons'
import { useToast } from '../ui/Toast'

const COPY = {
  es: { snooze: 'Posponer', reminder: (label: string) => `Aviso: ${label}`, done: 'Hecha' },
  en: { snooze: 'Snooze', reminder: (label: string) => `Reminder: ${label}`, done: 'Done' },
} as const

interface SnoozeBarProps {
  task: Task
  onDone: () => void
}

/** Lo primero que se ve al abrir una tarea desde su aviso. */
export function SnoozeBar({ task, onDone }: SnoozeBarProps) {
  const dispatch = useDispatch()
  const toast = useToast()
  const copy = useCopy(COPY)

  return (
    <>
      <p className="sheet__title">{copy.snooze}</p>
      <div className="sheet__chips">
        {snoozeOptions(Date.now()).map((option) => (
          <button
            key={option.key}
            type="button"
            className="chip chip--option"
            onClick={() => {
              dispatch({ type: 'task/snooze', id: task.id, at: option.at, now: Date.now() })
              toast({ message: copy.reminder(reminderLabel({ kind: 'at', at: option.at }, Date.now())) })
              onDone()
            }}
          >
            {option.label}
          </button>
        ))}
        {!task.done && (
          <button
            type="button"
            className="chip is-active"
            onClick={() => {
              dispatch({ type: 'task/toggle', id: task.id })
              onDone()
            }}
          >
            <IconCheck size={13} strokeWidth={2.5} />
            {copy.done}
          </button>
        )}
      </div>
    </>
  )
}
