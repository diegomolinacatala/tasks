import { useState } from 'react'
import { toInstant } from '../../lib/date'
import { isPending, reminderLabel, reminderPresets } from '../../lib/reminders'
import { useDispatch } from '../../state/StoreProvider'
import type { Task } from '../../types'
import { usePush } from '../push/PushProvider'
import { IconBell, IconClose } from '../ui/Icons'

interface ReminderPickerProps {
  task: Task
}

const LOCAL_DATETIME = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/

export function ReminderPicker({ task }: ReminderPickerProps) {
  const dispatch = useDispatch()
  const [adding, setAdding] = useState(false)
  const now = Date.now()
  const presets = adding ? reminderPresets(task, now) : []

  const addAt = (value: string) => {
    const match = LOCAL_DATETIME.exec(value)
    if (!match?.[1] || !match[2]) return
    const at = toInstant(match[1], match[2])
    if (at <= Date.now()) return
    dispatch({ type: 'reminder/add', taskId: task.id, reminder: { kind: 'at', at } })
    setAdding(false)
  }

  return (
    <>
      <p className="sheet__title">Recordatorios</p>
      <div className="sheet__chips">
        {task.reminders.map((reminder) => {
          const label = reminderLabel(reminder, now)
          return (
            <button
              key={reminder.id}
              type="button"
              className={`chip chip--reminder ${isPending(task, reminder, now) ? '' : 'is-muted'}`}
              aria-label={`Quitar recordatorio ${label}`}
              onClick={() => dispatch({ type: 'reminder/remove', taskId: task.id, reminderId: reminder.id })}
            >
              <IconBell size={13} />
              {label}
              <IconClose size={12} className="chip__remove" />
            </button>
          )
        })}

        {!adding && (
          <button type="button" className="chip" onClick={() => setAdding(true)}>
            + Añadir
          </button>
        )}

        {presets.map((preset) => (
          <button
            key={preset.key}
            type="button"
            className="chip chip--option"
            onClick={() => {
              dispatch({ type: 'reminder/add', taskId: task.id, reminder: preset.draft })
              setAdding(false)
            }}
          >
            {preset.label}
          </button>
        ))}

        {adding && (
          <label className="chip chip--option">
            Otra…
            <input
              type="datetime-local"
              className="sr-only"
              onChange={(event) => addAt(event.target.value)}
            />
          </label>
        )}
      </div>
      <PushHint hasReminders={task.reminders.length > 0} />
    </>
  )
}

/** Solo aparece si hay recordatorios que no van a llegar. */
function PushHint({ hasReminders }: { hasReminders: boolean }) {
  const push = usePush()
  if (!hasReminders) return null

  if (push.status === 'off') {
    return (
      <button type="button" className="sheet__hint" disabled={push.busy} onClick={() => void push.enable()}>
        <IconBell size={14} />
        Activar avisos en este dispositivo
      </button>
    )
  }
  if (push.status === 'needs-install') {
    return <p className="sheet__note">Para recibir avisos, añade la app a la pantalla de inicio.</p>
  }
  if (push.status === 'denied') {
    return <p className="sheet__note">Avisos bloqueados en los ajustes del sistema.</p>
  }
  return null
}
