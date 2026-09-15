import type { CSSProperties, PointerEvent as ReactPointerEvent, Ref } from 'react'
import type { DraggableAttributes, DraggableSyntheticListeners } from '@dnd-kit/core'
import type { Task } from '../../types'
import { IconCheck, IconGrip, IconTrash } from '../ui/Icons'
import { TaskRow } from './TaskRow'
import { SWIPE_TRIGGER_PX, useSwipe } from './useSwipe'
import './task.css'

interface TaskShellProps {
  task: Task
  meta?: string | null
  overdue?: boolean
  isDragging: boolean
  setNodeRef: Ref<HTMLLIElement>
  style?: CSSProperties
  attributes: DraggableAttributes
  listeners: DraggableSyntheticListeners
  onToggle: () => void
  onOpen: () => void
  onDelete: () => void
}

/**
 * Fila con gestos. El arrastre vive solo en el asa (`task__grip`): así el resto de la
 * fila queda libre para el scroll vertical y para deslizar en horizontal.
 */
export function TaskShell({
  task,
  meta,
  overdue,
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

  const onGripDown = (event: ReactPointerEvent<HTMLButtonElement>) => {
    // El asa no debe iniciar también el deslizamiento de la fila.
    event.stopPropagation()
    listeners?.onPointerDown?.(event)
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
          // Capa propia solo mientras se mueve: una por fila en reposo gasta memoria de GPU y
          // hace que el scroll de listas largas vaya a tirones en iPhone.
          transform: swipe.offset ? `translate3d(${swipe.offset}px,0,0)` : undefined,
          willChange: swipe.settling ? undefined : 'transform',
          transition: swipe.settling ? 'transform var(--dur-2) var(--ease)' : 'none',
        }}
        onPointerDown={swipe.handlers.onPointerDown}
        onPointerMove={swipe.handlers.onPointerMove}
        onPointerUp={swipe.handlers.onPointerUp}
        onPointerCancel={swipe.handlers.onPointerCancel}
      >
        <TaskRow task={task} meta={meta} overdue={overdue} onToggle={onToggle} onOpen={onOpen} />
        <button
          type="button"
          className="task__grip"
          aria-label={`Mover «${task.title}»`}
          onContextMenu={(event) => event.preventDefault()}
          {...attributes}
          {...listeners}
          onPointerDown={onGripDown}
        >
          <IconGrip size={16} />
        </button>
      </div>
    </li>
  )
}
