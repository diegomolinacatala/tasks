import { useDroppable } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import type { ReactNode } from 'react'

interface TaskColumnProps {
  columnId: string
  taskIds: string[]
  empty?: ReactNode
  /** `false` para listas de las que solo se puede sacar (atrasadas). */
  droppable?: boolean
  children: ReactNode
}

export function TaskColumn({ columnId, taskIds, empty, droppable = true, children }: TaskColumnProps) {
  const { setNodeRef, isOver } = useDroppable({
    id: columnId,
    data: { type: 'container' },
    disabled: !droppable,
  })

  return (
    <ul ref={setNodeRef} className={`column ${isOver ? 'is-over' : ''}`}>
      <SortableContext items={taskIds} strategy={verticalListSortingStrategy}>
        {children}
      </SortableContext>
      {taskIds.length === 0 && empty ? <li className="column__empty">{empty}</li> : null}
    </ul>
  )
}
