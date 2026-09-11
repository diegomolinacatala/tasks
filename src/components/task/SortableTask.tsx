import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { Task } from '../../types'
import { TaskShell } from './TaskShell'

interface SortableTaskProps {
  task: Task
  meta?: string | null
  sectionId: string | null
  onToggle: () => void
  onOpen: () => void
  onDelete: () => void
}

export function SortableTask({ task, meta, sectionId, ...actions }: SortableTaskProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: task.id,
    data: { type: 'task', sectionId },
  })

  return (
    <TaskShell
      task={task}
      meta={meta}
      isDragging={isDragging}
      setNodeRef={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      attributes={attributes}
      listeners={listeners}
      {...actions}
    />
  )
}
