import { useMemo, useState } from 'react'
import { DndContext, DragOverlay, MeasuringStrategy } from '@dnd-kit/core'
import type { DragEndEvent, DragStartEvent } from '@dnd-kit/core'
import { arrayMove } from '@dnd-kit/sortable'
import { relativeLabel } from '../../lib/date'
import { BACKLOG_SCOPE } from '../../lib/order'
import { haptic } from '../../lib/platform/feedback'
import { useCopy } from '../../state/LanguageProvider'
import { useAppState, useDispatch } from '../../state/StoreProvider'
import { backlogTasks } from '../../state/selectors'
import type { IsoDate, Task } from '../../types'
import { announcements, buzz, pressCue, scopedCollision, useDragSensors } from '../dnd/dnd'
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
  /** Hoy para las rutinas: puede ir por detrás del calendario si su día empieza de madrugada. */
  routineDay: IsoDate
}

const COPY = {
  es: {
    undo: 'Deshacer',
    cleared: (count: number) => (count === 1 ? 'Hecha borrada' : `${count} hechas borradas`),
    kicker: 'Sin fecha',
    title: 'Bandeja',
    pending: (count: number) => `${count} pendientes`,
    tasks: 'Tareas',
    empty: 'Nada sin fecha.',
    clear: (count: number) => `Borrar las ${count} hechas`,
  },
  en: {
    undo: 'Undo',
    cleared: (count: number) => (count === 1 ? 'Done task deleted' : `${count} done tasks deleted`),
    kicker: 'No date',
    title: 'Inbox',
    pending: (count: number) => `${count} pending`,
    tasks: 'Tasks',
    empty: 'Nothing without a date.',
    clear: (count: number) => `Delete ${count} done`,
  },
} as const

/** Mientras se arrastra, el muelle sube: hay que medir los días donde está de verdad. */
const MEASURING = { droppable: { strategy: MeasuringStrategy.Always } }

/**
 * Bandeja: lo que aún no tiene día. Arriba, las rutinas (lo que se repite); debajo, las tareas sin
 * fecha, que se ordenan con el asa y se planifican soltándolas en un día del muelle.
 */
export function InboxView({ today, routineDay }: InboxViewProps) {
  const state = useAppState()
  const dispatch = useDispatch()
  const toast = useToast()
  const sensors = useDragSensors()
  const copy = useCopy(COPY)
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
      actionLabel: copy.undo,
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
      message: copy.cleared(done.length),
      actionLabel: copy.undo,
      onAction: () => done.forEach((task) => dispatch({ type: 'task/restore', task })),
    })
  }

  const dragged = activeId ? (tasks.find((task) => task.id === activeId) ?? null) : null

  return (
    <div className={`view inbox ${activeId ? 'is-dragging' : ''}`}>
      <header className="view__head">
        <p className="view__kicker">{copy.kicker}</p>
        <div className="view__headline">
          <h1 className="view__title">{copy.title}</h1>
          {pending.length > 0 && (
            <p className="view__stat" aria-label={copy.pending(pending.length)}>
              {pending.length}
            </p>
          )}
        </div>
        <div className="view__progress view__progress--plain" aria-hidden="true" />
      </header>

      <RoutinesBlock today={routineDay} />

      <DndContext
        sensors={sensors}
        collisionDetection={scopedCollision}
        onDragPending={pressCue.onDragPending}
        onDragAbort={pressCue.onDragAbort}
        measuring={MEASURING}
        accessibility={{ announcements }}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        onDragCancel={() => setActiveId(null)}
      >
        <section className="block">
          <BlockHeader label={copy.tasks} count={pending.length} />
          <TaskColumn columnId={columnId(BACKLOG)} taskIds={ids} empty={copy.empty}>
            {tasks.map((task) => (
              <SortableTask key={task.id} task={task} sectionId={null} />
            ))}
          </TaskColumn>
          {done.length > 1 && (
            <button type="button" className="inbox__clear" onClick={clearDone}>
              <IconTrash size={15} />
              {copy.clear(done.length)}
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
