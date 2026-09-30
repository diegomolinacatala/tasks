import { useMemo, useState } from 'react'
import { DndContext, DragOverlay, MeasuringStrategy } from '@dnd-kit/core'
import type { DragEndEvent, DragStartEvent } from '@dnd-kit/core'
import { arrayMove } from '@dnd-kit/sortable'
import { relativeLabel } from '../../lib/date'
import { BACKLOG_SCOPE } from '../../lib/order'
import { haptic } from '../../lib/platform/feedback'
import { useAppState, useDispatch } from '../../state/StoreProvider'
import { backlogTasks } from '../../state/selectors'
import type { IsoDate, Task } from '../../types'
import { announcements, buzz, scopedCollision, useDragSensors } from '../dnd/dnd'
import { BACKLOG, columnId, dayOfDrop } from '../dnd/ids'
import { RoutinesBlock } from '../routines/RoutinesBlock'
import { BlockHeader } from '../section/BlockHeader'
import { TaskColumn } from '../section/TaskColumn'
import { SortableTask } from '../task/SortableTask'
import { TaskRow } from '../task/TaskRow'
import { IconTrash } from '../ui/Icons'
import { useToast } from '../ui/Toast'
import { DayDock } from './DayDock'
import './views.css'
import './inbox.css'

interface InboxViewProps {
  today: IsoDate
}

/** Mientras se arrastra, el muelle sube: hay que medir los días donde está de verdad. */
const MEASURING = { droppable: { strategy: MeasuringStrategy.Always } }

/**
 * Bandeja: lo que aún no tiene día. Arriba, las rutinas (lo que se repite); debajo, las tareas sin
 * fecha, que se ordenan con el asa y se planifican soltándolas en un día del muelle.
 */
export function InboxView({ today }: InboxViewProps) {
  const state = useAppState()
  const dispatch = useDispatch()
  const toast = useToast()
  const sensors = useDragSensors()
  const [activeId, setActiveId] = useState<string | null>(null)

  const tasks = useMemo(() => backlogTasks(state), [state])
  const ids = useMemo(() => tasks.map((task) => task.id), [tasks])
  const pending = tasks.filter((task) => !task.done)
  const done = tasks.filter((task) => task.done)

  const schedule = (task: Task, date: IsoDate) => {
    dispatch({ type: 'task/move', id: task.id, date, sectionId: null })
    haptic('success')
    toast({
      message: `${task.title} → ${relativeLabel(date, today)}`,
      actionLabel: 'Deshacer',
      onAction: () => dispatch({ type: 'task/move', id: task.id, date: null, sectionId: null }),
    })
  }

  const onDragStart = ({ active }: DragStartEvent) => {
    setActiveId(String(active.id))
    buzz()
  }

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    setActiveId(null)
    const task = tasks.find((item) => item.id === String(active.id))
    if (!task || !over) return
    const date = dayOfDrop(String(over.id))
    if (date) return schedule(task, date)
    const from = ids.indexOf(task.id)
    const overId = String(over.id)
    const to = overId === columnId(BACKLOG) ? ids.length - 1 : ids.indexOf(overId)
    if (from >= 0 && to >= 0 && from !== to) dispatch({ type: 'scope/reorder', scope: BACKLOG_SCOPE, ids: arrayMove(ids, from, to) })
  }

  const clearDone = () => {
    done.forEach((task) => dispatch({ type: 'task/remove', id: task.id }))
    haptic('warning')
    toast({
      message: done.length === 1 ? 'Hecha borrada' : `${done.length} hechas borradas`,
      actionLabel: 'Deshacer',
      onAction: () => done.forEach((task) => dispatch({ type: 'task/restore', task })),
    })
  }

  const dragged = activeId ? (tasks.find((task) => task.id === activeId) ?? null) : null

  return (
    <div className="view inbox">
      <header className="view__head">
        <p className="view__kicker">Sin fecha</p>
        <div className="view__headline">
          <h1 className="view__title">Bandeja</h1>
          {pending.length > 0 && (
            <p className="view__stat" aria-label={`${pending.length} pendientes`}>
              {pending.length}
            </p>
          )}
        </div>
        <div className="view__progress view__progress--plain" aria-hidden="true" />
      </header>

      <RoutinesBlock today={today} />

      <DndContext
        sensors={sensors}
        collisionDetection={scopedCollision}
        measuring={MEASURING}
        accessibility={{ announcements }}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        onDragCancel={() => setActiveId(null)}
      >
        <section className="block">
          <BlockHeader label="Tareas" count={pending.length} />
          <TaskColumn columnId={columnId(BACKLOG)} taskIds={ids} empty="Nada sin fecha.">
            {tasks.map((task) => (
              <SortableTask key={task.id} task={task} sectionId={null} />
            ))}
          </TaskColumn>
          {done.length > 1 && (
            <button type="button" className="inbox__clear" onClick={clearDone}>
              <IconTrash size={15} />
              Borrar las {done.length} hechas
            </button>
          )}
        </section>

        <DayDock today={today} open={dragged !== null} />

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
