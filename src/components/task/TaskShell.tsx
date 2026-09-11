import type { CSSProperties, PointerEvent as ReactPointerEvent, Ref } from 'react'
import type { DraggableAttributes, DraggableSyntheticListeners } from '@dnd-kit/core'
import type { Task } from '../../types'
import { IconCheck, IconTrash } from '../ui/Icons'
import { TaskRow } from './TaskRow'
import { SWIPE_TRIGGER_PX, useSwipe } from './useSwipe'
import './task.css'

interface TaskShellProps {
  task: Task
  meta?: string | null
  isDragging: boolean
  setNodeRef: Ref<HTMLLIElement>
  style?: CSSProperties
  attributes: DraggableAttributes
  listeners: DraggableSyntheticListeners
  onToggle: () => void
  onOpen: () => void
  onDelete: () => void
}

/** Fila con gesto: pulsación mantenida para arrastrar, deslizar para completar o borrar. */
export function TaskShell({
  task,
  meta,
  isDragging,
  setNodeRef,
  style,
  attributes,
  listeners,
  onToggle,
  onOpen,
  onDelete,
}: TaskShellProps) {
  const swipe = useSwipe({ onLeft: onDelete, onRight: onToggle, disabled: isDragging })
  const progress = Math.min(1, Math.abs(swipe.offset) / SWIPE_TRIGGER_PX)

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    listeners?.onPointerDown?.(event)
    swipe.handlers.onPointerDown(event)
  }

  return (
    <li ref={setNodeRef} className={`task ${isDragging ? 'is-dragging' : ''}`} style={style}>
      <div className="task__affordance" aria-hidden="true">
        <span className="task__act task__act--done" style={{ opacity: swipe.offset > 0 ? progress : 0 }}>
          <IconCheck size={18} />
        </span>
        <span className="task__act task__act--delete" style={{ opacity: swipe.offset < 0 ? progress : 0 }}>
          <IconTrash size={18} />
        </span>
      </div>

      <div
        className="task__surface"
        style={{
          transform: `translate3d(${swipe.offset}px,0,0)`,
          transition: swipe.settling ? 'transform var(--dur-2) var(--ease)' : 'none',
        }}
        onContextMenu={(event) => event.preventDefault()}
        {...attributes}
        {...listeners}
        onPointerDown={onPointerDown}
        onPointerMove={swipe.handlers.onPointerMove}
        onPointerUp={swipe.handlers.onPointerUp}
        onPointerCancel={swipe.handlers.onPointerCancel}
      >
        <TaskRow task={task} meta={meta} onToggle={onToggle} onOpen={onOpen} />
      </div>
    </li>
  )
}
