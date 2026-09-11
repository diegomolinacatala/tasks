import { useMemo, useState } from 'react'
import { DndContext, DragOverlay, useDroppable } from '@dnd-kit/core'
import type { DragEndEvent, DragStartEvent } from '@dnd-kit/core'
import { addDays, dayNameShort, dayNumber, rangeLabel, todayIso, weekDays } from '../../lib/date'
import { useAppState, useDispatch } from '../../state/StoreProvider'
import { sortedSections } from '../../state/selectors'
import type { IsoDate, Task } from '../../types'
import { announcements, scopedCollision, useDragSensors } from '../dnd/dnd'
import { DraggableTask } from '../task/DraggableTask'
import { TaskRow } from '../task/TaskRow'
import { useTaskActions } from '../task/useTaskActions'
import { IconChevronLeft, IconChevronRight } from '../ui/Icons'
import './views.css'

const dayDropId = (day: IsoDate) => `day:${day}`

interface WeekViewProps {
  anchor: IsoDate
  selectedDay: IsoDate
  onAnchorChange: (day: IsoDate) => void
  onSelectDay: (day: IsoDate) => void
  onOpenTask: (id: string) => void
}

export function WeekView({ anchor, selectedDay, onAnchorChange, onSelectDay, onOpenTask }: WeekViewProps) {
  const state = useAppState()
  const dispatch = useDispatch()
  const sensors = useDragSensors()
  const { toggle, remove } = useTaskActions()
  const [activeId, setActiveId] = useState<string | null>(null)

  const days = useMemo(() => weekDays(anchor), [anchor])
  const today = todayIso()
  const byId = useMemo(() => new Map(state.tasks.map((task) => [task.id, task])), [state.tasks])

  const rank = useMemo(() => {
    const map = new Map<string, number>()
    sortedSections(state).forEach((section, index) => map.set(section.id, index + 1))
    return map
  }, [state])

  const tasksByDay = useMemo(() => {
    const weight = (task: Task) => (task.sectionId ? (rank.get(task.sectionId) ?? 99) : 0)
    const map = new Map<IsoDate, Task[]>(days.map((day) => [day, []]))
    for (const task of state.tasks) {
      if (task.date) map.get(task.date)?.push(task)
    }
    for (const list of map.values()) {
      list.sort((a, b) => Number(a.done) - Number(b.done) || weight(a) - weight(b) || a.order - b.order)
    }
    return map
  }, [state.tasks, days, rank])

  const onDragStart = ({ active }: DragStartEvent) => setActiveId(String(active.id))

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    setActiveId(null)
    if (!over) return
    const overId = String(over.id)
    if (!overId.startsWith('day:')) return
    const day = overId.slice(4)
    const task = byId.get(String(active.id))
    if (!task || task.date === day) return
    dispatch({ type: 'task/move', id: task.id, date: day, sectionId: task.sectionId })
  }

  const dragged = activeId ? (byId.get(activeId) ?? null) : null
  const first = days[0] ?? anchor
  const last = days[6] ?? anchor
  const showsToday = days.includes(today)

  return (
    <div className="view">
      <header className="view__head">
        <p className="view__kicker">Semana</p>
        <div className="view__headline">
          <h1 className="view__title view__title--sm">{rangeLabel(first, last)}</h1>
          <div className="week__nav">
            {!showsToday && (
              <button type="button" className="week__today" onClick={() => onAnchorChange(today)}>
                Hoy
              </button>
            )}
            <button type="button" aria-label="Semana anterior" onClick={() => onAnchorChange(addDays(anchor, -7))}>
              <IconChevronLeft size={18} />
            </button>
            <button type="button" aria-label="Semana siguiente" onClick={() => onAnchorChange(addDays(anchor, 7))}>
              <IconChevronRight size={18} />
            </button>
          </div>
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
        {days.map((day) => (
          <DayBlock
            key={day}
            day={day}
            tasks={tasksByDay.get(day) ?? []}
            isToday={day === today}
            isPast={day < today}
            isSelected={day === selectedDay}
            onSelect={() => onSelectDay(day)}
            onToggle={toggle}
            onDelete={remove}
            onOpen={onOpenTask}
          />
        ))}

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

interface DayBlockProps {
  day: IsoDate
  tasks: Task[]
  isToday: boolean
  isPast: boolean
  isSelected: boolean
  onSelect: () => void
  onToggle: (id: string) => void
  onDelete: (id: string) => void
  onOpen: (id: string) => void
}

function DayBlock({ day, tasks, isToday, isPast, isSelected, onSelect, onToggle, onDelete, onOpen }: DayBlockProps) {
  const { setNodeRef, isOver } = useDroppable({ id: dayDropId(day), data: { type: 'container' } })
  const pending = tasks.filter((task) => !task.done).length
  const overdue = isPast && pending > 0

  return (
    <section
      ref={setNodeRef}
      className={`day ${isToday ? 'is-today' : ''} ${overdue ? 'is-overdue' : ''} ${
        isSelected ? 'is-selected' : ''
      } ${isOver ? 'is-over' : ''}`}
    >
      <button type="button" className="day__head" onClick={onSelect}>
        <span className="day__name">{dayNameShort(day)}</span>
        <span className="day__num">{dayNumber(day)}</span>
        {pending > 0 && <span className="day__count">{pending}</span>}
      </button>
      <ul className="day__list">
        {tasks.map((task) => (
          <DraggableTask
            key={task.id}
            task={task}
            overdue={isPast && !task.done}
            onToggle={() => onToggle(task.id)}
            onDelete={() => onDelete(task.id)}
            onOpen={() => onOpen(task.id)}
          />
        ))}
      </ul>
    </section>
  )
}
