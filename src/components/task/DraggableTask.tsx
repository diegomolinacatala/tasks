import { memo } from 'react'
import { useDraggable } from '@dnd-kit/core'
import type { Task } from '../../types'
import { TaskShell } from './TaskShell'

interface DraggableTaskProps {
  task: Task
  meta?: string | null
  overdue?: boolean
  /** `false`: la fila con sus gestos, pero sin poder cogerla (lo hecho plegado en la Bandeja). */
  draggable?: boolean
}

/** Arrastrable sin reordenar: para soltar la tarea en otro día de la semana. */
export const DraggableTask = memo(function DraggableTask({ task, meta, overdue, draggable = true }: DraggableTaskProps) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: task.id,
    data: { type: 'task' },
    disabled: !draggable,
  })

  return (
    <TaskShell
      task={task}
      meta={meta}
      overdue={overdue}
      isDragging={isDragging}
      setNodeRef={setNodeRef}
      attributes={attributes}
      listeners={listeners}
    />
  )
})
