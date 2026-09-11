import { useDroppable } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import type { ReactNode } from 'react'

interface TaskColumnProps {
  columnId: string
  taskIds: string[]
  empty?: ReactNode
  children: ReactNode
}

export function TaskColumn({ columnId, taskIds, empty, children }: TaskColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id: columnId, data: { type: 'container' } })

  return (
    <ul ref={setNodeRef} className={`column ${isOver ? 'is-over' : ''}`}>
      <SortableContext items={taskIds} strategy={verticalListSortingStrategy}>
        {children}
      </SortableContext>
      {taskIds.length === 0 && <li className="column__empty">{empty ?? 'Vacío'}</li>}
    </ul>
  )
}
