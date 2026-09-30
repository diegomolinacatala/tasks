import { memo } from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { Task } from '../../types'
import { TaskShell } from './TaskShell'

interface SortableTaskProps {
  task: Task
  meta?: string | null
  overdue?: boolean
  sectionId: string | null
  /** Se puede coger pero no recibe nada: se usa en el bloque de atrasadas. */
  dropDisabled?: boolean
}

export const SortableTask = memo(function SortableTask({ task, meta, overdue, sectionId, dropDisabled }: SortableTaskProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: task.id,
    data: { type: 'task', sectionId },
    disabled: dropDisabled ? { draggable: false, droppable: true } : undefined,
  })

  return (
    <TaskShell
      task={task}
      meta={meta}
      overdue={overdue}
      isDragging={isDragging}
      setNodeRef={setNodeRef}
      style={transform ? { transform: CSS.Translate.toString(transform), transition } : transition ? { transition } : undefined}
      attributes={attributes}
      listeners={listeners}
    />
  )
})
