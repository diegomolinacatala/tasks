import { shortTime } from '../../lib/date'
import { nextReminderAt } from '../../lib/reminders'
import type { Task } from '../../types'
import { IconBell, IconCheck } from '../ui/Icons'

interface TaskRowProps {
  task: Task
  meta?: string | null
  overdue?: boolean
  onToggle?: () => void
  onOpen?: () => void
}

export function TaskRow({ task, meta, overdue = false, onToggle, onOpen }: TaskRowProps) {
  const time = task.date && task.time ? shortTime(task.time) : null
  const text = [meta, time].filter(Boolean).join(' · ')
  const reminding = nextReminderAt(task, Date.now()) !== null

  return (
    <div className={`row ${task.done ? 'is-done' : ''} ${overdue ? 'is-overdue' : ''}`}>
      <button
        type="button"
        className="row__check"
        aria-pressed={task.done}
        aria-label={task.done ? `Marcar «${task.title}» como pendiente` : `Completar «${task.title}»`}
        onPointerDown={(event) => event.stopPropagation()}
        onClick={onToggle}
      >
        <IconCheck size={13} strokeWidth={2.5} />
      </button>
      <button type="button" className="row__main" onClick={onOpen}>
        <span className="row__title">{task.title}</span>
        {(text || reminding) && (
          <span className="row__meta">
            {reminding && <IconBell size={11} strokeWidth={2} />}
            {text}
          </span>
        )}
      </button>
    </div>
  )
}
