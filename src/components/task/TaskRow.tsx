import type { Task } from '../../types'
import { IconCheck } from '../ui/Icons'

interface TaskRowProps {
  task: Task
  meta?: string | null
  onToggle?: () => void
  onOpen?: () => void
}

export function TaskRow({ task, meta, onToggle, onOpen }: TaskRowProps) {
  return (
    <div className={`row ${task.done ? 'is-done' : ''}`}>
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
        {meta ? <span className="row__meta">{meta}</span> : null}
      </button>
    </div>
  )
}
