import { useDraggable } from '@dnd-kit/core'
import type { Task } from '../../types'
import { TaskShell } from './TaskShell'

interface DraggableTaskProps {
  task: Task
  meta?: string | null
  onToggle: () => void
  onOpen: () => void
  onDelete: () => void
}

/** Arrastrable sin reordenar: se usa para mover tareas de un día a otro. */
export function DraggableTask({ task, meta, ...actions }: DraggableTaskProps) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: task.id,
    data: { type: 'task' },
  })

  return (
    <TaskShell
      task={task}
      meta={meta}
      isDragging={isDragging}
      setNodeRef={setNodeRef}
      attributes={attributes}
      listeners={listeners}
      {...actions}
    />
  )
}
