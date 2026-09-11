import { useMemo, useState } from 'react'
import { DndContext, DragOverlay } from '@dnd-kit/core'
import type { DragEndEvent, DragStartEvent } from '@dnd-kit/core'
import { arrayMove } from '@dnd-kit/sortable'
import { BACKLOG_SCOPE } from '../../lib/order'
import { useAppState, useDispatch } from '../../state/StoreProvider'
import { backlogTasks, findSection } from '../../state/selectors'
import { announcements, scopedCollision, useDragSensors } from '../dnd/dnd'
import { ROOT, columnId } from '../dnd/ids'
import { TaskColumn } from '../section/TaskColumn'
import { SortableTask } from '../task/SortableTask'
import { TaskRow } from '../task/TaskRow'
import { useTaskActions } from '../task/useTaskActions'
import './views.css'

export function BacklogView({ onOpenTask }: { onOpenTask: (id: string) => void }) {
  const state = useAppState()
  const dispatch = useDispatch()
  const sensors = useDragSensors()
  const { toggle, remove } = useTaskActions()
  const [activeId, setActiveId] = useState<string | null>(null)

  const tasks = useMemo(() => backlogTasks(state), [state])
  const ids = tasks.map((task) => task.id)
  const pending = tasks.filter((task) => !task.done).length

  const onDragStart = ({ active }: DragStartEvent) => setActiveId(String(active.id))

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    setActiveId(null)
    if (!over) return
    const from = ids.indexOf(String(active.id))
    const to = ids.indexOf(String(over.id))
    if (from < 0 || to < 0 || from === to) return
    dispatch({ type: 'scope/reorder', scope: BACKLOG_SCOPE, ids: arrayMove(ids, from, to) })
  }

  const dragged = activeId ? (tasks.find((task) => task.id === activeId) ?? null) : null

  return (
    <div className="view">
      <header className="view__head">
        <p className="view__kicker">Sin fecha</p>
        <div className="view__headline">
          <h1 className="view__title view__title--sm">Backlog</h1>
          {pending > 0 && <p className="view__stat">{pending}</p>}
        </div>
      </header>

      <DndContext
        sensors={sensors}
        collisionDetection={scopedCollision}
        accessibility={{ announcements }}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        onDragCancel={() => setActiveId(null)}
      >
        <TaskColumn columnId={columnId(ROOT)} taskIds={ids} empty="Aquí se guarda lo que no tiene día.">
          {tasks.map((task) => (
            <SortableTask
              key={task.id}
              task={task}
              sectionId={task.sectionId}
              meta={findSection(state, task.sectionId)?.name ?? null}
              onToggle={() => toggle(task.id)}
              onDelete={() => remove(task.id)}
              onOpen={() => onOpenTask(task.id)}
            />
          ))}
        </TaskColumn>

        <DragOverlay dropAnimation={{ duration: 180, easing: 'cubic-bezier(0.2,0.8,0.2,1)' }}>
          {dragged && (
            <div className="task-overlay">
              <TaskRow task={dragged} />
            </div>
          )}
        </DragOverlay>
      </DndContext>
    </div>
  )
}
