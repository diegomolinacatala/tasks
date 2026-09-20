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
  onToggle: () => void
  onOpen: () => void
  onDelete: () => void
  onImportance: (importance: number) => void
}

export function SortableTask({ task, meta, overdue, sectionId, dropDisabled, ...actions }: SortableTaskProps) {
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
      style={{ transform: CSS.Translate.toString(transform), transition }}
      attributes={attributes}
      listeners={listeners}
      {...actions}
    />
  )
}
