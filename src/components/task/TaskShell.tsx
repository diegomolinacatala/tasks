import { Suspense, lazy, memo, useState } from 'react'
import type { CSSProperties, Ref } from 'react'
import type { DraggableAttributes, DraggableSyntheticListeners } from '@dnd-kit/core'
import { useCopy } from '../../state/LanguageProvider'
import type { Task } from '../../types'
import { useSizing } from '../importance/sizing'
import { SwipeRow } from './SwipeRow'
import { TaskRow } from './TaskRow'
import { useRowActions } from './rowActions'
import { splitListeners } from '../dnd/dnd'
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
 * Fila con gestos: deslizar en horizontal la completa o la borra, y mantenerla pulsada la coge para
 * arrastrarla (`useDragSensors`). Con el teclado se coge con su botón "Mover", que no se ve. En el modo
 * "Aa" no se arrastra: sale el mando de importancia (lo hecho no lo lleva: vuelve al tamaño normal).
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
  const { hold, keyboard } = splitListeners(listeners)

  return (
    <SwipeRow
      className={`task ${isDragging ? 'is-dragging' : ''}`}
      style={style}
      flip={task.id}
      nodeRef={setNodeRef}
      disabled={isDragging}
      hold={sizing ? undefined : hold}
      dragId={task.id}
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
        <button type="button" className="sr-only" aria-label={copy.move(task.title)} {...attributes} {...keyboard} />
      )}
    </SwipeRow>
  )
})
