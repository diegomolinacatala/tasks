import { Suspense, lazy, memo, useState } from 'react'
import type { CSSProperties, PointerEvent as ReactPointerEvent, Ref } from 'react'
import type { DraggableAttributes, DraggableSyntheticListeners } from '@dnd-kit/core'
import { useCopy } from '../../state/LanguageProvider'
import type { Task } from '../../types'
import { useSizing } from '../importance/sizing'
import { IconGrip } from '../ui/Icons'
import { SwipeRow } from './SwipeRow'
import { TaskRow } from './TaskRow'
import { useRowActions } from './rowActions'
import './task.css'

// El modo "Aa" se usa poco: su mando se carga la primera vez que se activa.
const ImportanceKnob = lazy(() =>
  import('../importance/ImportanceKnob').then((module) => ({ default: module.ImportanceKnob })),
)

const COPY = {
  es: { move: (title: string) => `Mover «${title}»` },
  en: { move: (title: string) => `Move “${title}”` },
} as const

interface TaskShellProps {
  task: Task
  meta?: string | null
  overdue?: boolean
  isDragging: boolean
  setNodeRef: Ref<HTMLLIElement>
  style?: CSSProperties
  attributes: DraggableAttributes
  listeners: DraggableSyntheticListeners
}

/**
 * Fila con gestos. El arrastre vive solo en el asa (`task__grip`): así el resto de la
 * fila queda libre para el scroll vertical y para deslizar en horizontal. En el modo "Aa" el asa
 * deja su sitio al mando de importancia (lo hecho no lo lleva: vuelve al tamaño normal).
 *
 * Memorizada: las acciones llegan por contexto y no cambian, así que tachar una tarea solo vuelve a
 * pintar esa fila y no la lista entera.
 */
export const TaskShell = memo(function TaskShell({
  task,
  meta,
  overdue,
  isDragging,
  setNodeRef,
  style,
  attributes,
  listeners,
}: TaskShellProps) {
  const sizing = useSizing()
  const actions = useRowActions()
  const copy = useCopy(COPY)
  const [sizingTo, setSizingTo] = useState<number | null>(null)

  const onGripDown = (event: ReactPointerEvent<HTMLButtonElement>) => {
    // El asa no debe iniciar también el deslizamiento de la fila.
    event.stopPropagation()
    listeners?.onPointerDown?.(event)
  }

  return (
    <SwipeRow
      className={`task ${isDragging ? 'is-dragging' : ''}`}
      style={style}
      flip={task.id}
      nodeRef={setNodeRef}
      disabled={isDragging}
      onRight={() => actions.toggle(task.id)}
      onLeft={() => actions.remove(task.id)}
    >
      <TaskRow
        task={task}
        meta={meta}
        overdue={overdue}
        importance={sizingTo ?? undefined}
        onToggle={() => actions.toggle(task.id)}
        onOpen={() => actions.open(task.id)}
      />
      {sizing ? (
        task.done ? (
          <span className="task__slot" aria-hidden="true" />
        ) : (
          <Suspense fallback={<span className="task__slot" aria-hidden="true" />}>
            <ImportanceKnob
              value={task.importance}
              title={task.title}
              onPreview={setSizingTo}
              onChange={(importance) => actions.setImportance(task.id, importance)}
            />
          </Suspense>
        )
      ) : (
        <button
          type="button"
          className="task__grip"
          aria-label={copy.move(task.title)}
          onContextMenu={(event) => event.preventDefault()}
          {...attributes}
          {...listeners}
          onPointerDown={onGripDown}
        >
          <IconGrip size={16} />
        </button>
      )}
    </SwipeRow>
  )
})
