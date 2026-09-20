import { Suspense, lazy, useState } from 'react'
import type { CSSProperties, PointerEvent as ReactPointerEvent, Ref } from 'react'
import type { DraggableAttributes, DraggableSyntheticListeners } from '@dnd-kit/core'
import type { Task } from '../../types'
import { useSizing } from '../importance/sizing'
import { IconCheck, IconGrip, IconTrash } from '../ui/Icons'
import { TaskRow } from './TaskRow'
import { SWIPE_TRIGGER_PX, useSwipe } from './useSwipe'
import './task.css'

// El modo "Aa" se usa poco: su mando se carga la primera vez que se activa.
const ImportanceKnob = lazy(() =>
  import('../importance/ImportanceKnob').then((module) => ({ default: module.ImportanceKnob })),
)

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
  onImportance: (importance: number) => void
}

/**
 * Fila con gestos. El arrastre vive solo en el asa (`task__grip`): así el resto de la
 * fila queda libre para el scroll vertical y para deslizar en horizontal. En el modo "Aa" el asa
 * deja su sitio al mando de importancia (lo hecho no lo lleva: vuelve al tamaño normal).
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
  onImportance,
}: TaskShellProps) {
  const sizing = useSizing()
  const [sizingTo, setSizingTo] = useState<number | null>(null)
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
        <TaskRow
          task={task}
          meta={meta}
          overdue={overdue}
          importance={sizingTo ?? undefined}
          onToggle={onToggle}
          onOpen={onOpen}
        />
        {sizing ? (
          task.done ? (
            <span className="task__slot" aria-hidden="true" />
          ) : (
            <Suspense fallback={<span className="task__slot" aria-hidden="true" />}>
              <ImportanceKnob value={task.importance} title={task.title} onPreview={setSizingTo} onChange={onImportance} />
            </Suspense>
          )
        ) : (
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
        )}
      </div>
    </li>
  )
}
