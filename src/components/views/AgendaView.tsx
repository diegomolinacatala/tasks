import { useEffect, useMemo, useRef, useState } from 'react'
import { DndContext, DragOverlay } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { addDays, dayNameLong, dayNumber, monthLong, monthYear, nearLabel, relativeLabel, startOfWeek } from '../../lib/date'
import { haptic } from '../../lib/platform/feedback'
import { routinesOn } from '../../lib/routines'
import { buildTimeline, timelineItems } from '../../lib/timeline'
import { useNowMinutes } from '../../hooks/useNow'
import { useAppState, useDispatch } from '../../state/StoreProvider'
import { progressOf, tasksOn } from '../../state/selectors'
import type { IsoDate, Task } from '../../types'
import { announcements, scopedCollision, useDragSensors } from '../dnd/dnd'
import { OVERDUE, ROOT, columnId, sectionDragId } from '../dnd/ids'
import { BlockHeader } from '../section/BlockHeader'
import { SectionBlock } from '../section/SectionBlock'
import { TaskColumn } from '../section/TaskColumn'
import { SortableTask } from '../task/SortableTask'
import { TaskRow } from '../task/TaskRow'
import { useTaskActions } from '../task/useTaskActions'
import { IconFeather, IconPlus } from '../ui/Icons'
import { useToast } from '../ui/Toast'
import { Timeline } from './Timeline'
import type { DayLoad } from './WeekStrip'
import { WeekStrip } from './WeekStrip'
import { useDayBoard } from './useDayBoard'
import './views.css'
import './agenda.css'

interface AgendaViewProps {
  day: IsoDate
  today: IsoDate
  onSelectDay: (day: IsoDate) => void
  onOpenSection: (id: string) => void
}

const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1)

/**
 * Agenda, como Structured: arriba el día en el que estás y la tira de su semana; debajo, lo
 * atrasado (solo hoy), el horario con lo que tiene hora y la lista de lo que no la tiene, con sus
 * secciones. Una tarea se lleva a otro día soltándola sobre él en la tira.
 */
export function AgendaView({ day, today, onSelectDay, onOpenSection }: AgendaViewProps) {
  const state = useAppState()
  const dispatch = useDispatch()
  const toast = useToast()
  const sensors = useDragSensors()
  const { toToday } = useTaskActions()
  const now = useNowMinutes(day === today)
  const [draftSection, setDraftSection] = useState<string | null>(null)

  const moveToDay = (taskId: string, date: IsoDate) => {
    const task = state.tasks.find((item) => item.id === taskId)
    if (!task || task.date === date) return
    dispatch({ type: 'task/move', id: taskId, date, sectionId: task.sectionId })
    haptic('success')
    toast({
      message: `${task.title} → ${relativeLabel(date, today)}`,
      actionLabel: 'Deshacer',
      onAction: () => dispatch({ type: 'task/move', id: taskId, date: task.date, sectionId: task.sectionId }),
    })
  }

  const { columns, hasOverdue, sections, activeId, activeType, handlers } = useDayBoard(day, today, moveToDay)

  const byId = useMemo(() => new Map(state.tasks.map((task) => [task.id, task])), [state.tasks])
  const dayTasks = useMemo(() => tasksOn(state, day), [state, day])
  const rows = useMemo(
    () => buildTimeline(timelineItems(dayTasks, routinesOn(state.routines, day)), day === today ? now : null),
    [dayTasks, state.routines, day, today, now],
  )
  const progress = progressOf(dayTasks)

  // Tres semanas: la elegida y las de al lado, que asoman al deslizar la tira.
  const monday = startOfWeek(day)
  // Los días que no cambian conservan su objeto: así solo se repinta el día tocado de la tira.
  const previousLoads = useRef<ReadonlyMap<IsoDate, DayLoad>>(new Map())
  const loads = useMemo(() => {
    const from = addDays(monday, -7)
    const to = addDays(monday, 13)
    const counts = new Map<IsoDate, DayLoad>()
    for (const task of state.tasks) {
      if (!task.date || task.date < from || task.date > to) continue
      const load = counts.get(task.date) ?? { total: 0, done: 0 }
      counts.set(task.date, { total: load.total + 1, done: load.done + (task.done ? 1 : 0) })
    }
    const map = new Map<IsoDate, DayLoad>()
    for (const [date, load] of counts) {
      const before = previousLoads.current.get(date)
      map.set(date, before && before.total === load.total && before.done === load.done ? before : load)
    }
    return map
  }, [state.tasks, monday])
  useEffect(() => {
    previousLoads.current = loads
  }, [loads])

  // Hacia dónde se mueve el día: el contenido entra por ese lado. Se compara con el último día
  // pintado, que se apunta después de pintar (en el render aún es el anterior).
  const previousDay = useRef(day)
  const direction = day > previousDay.current ? 'is-next' : day < previousDay.current ? 'is-prev' : ''
  useEffect(() => {
    previousDay.current = day
  }, [day])

  const overdueIds = columns[OVERDUE] ?? []
  const rootIds = columns[ROOT] ?? []
  const pending = (ids: string[]) => ids.filter((id) => !byId.get(id)?.done).length
  const untimedCount = rootIds.length + sections.reduce((sum, section) => sum + (columns[section.id]?.length ?? 0), 0)
  const pendingOfDay = dayTasks.filter((task) => !task.done).map((task) => task.id)
  // Un día sin tareas es un día libre, aunque tenga rutinas. Hoy siempre enseña su lista (y sus
  // secciones, donde soltar y desde donde crear una); otro día, solo si tiene algo sin hora.
  const free = !dayTasks.length && !(day === today && hasOverdue)
  const showUntimed = untimedCount > 0 || day === today

  const renderTask = (id: string, sectionId: string | null, options: { overdue?: boolean; meta?: string | null } = {}) => {
    const task = byId.get(id)
    if (!task) return null
    return (
      <SortableTask
        key={id}
        task={task}
        sectionId={sectionId}
        overdue={options.overdue ?? (day < today && !task.done)}
        meta={options.meta}
        dropDisabled={options.overdue}
      />
    )
  }

  const dragged: Task | null = activeType === 'task' && activeId ? (byId.get(activeId) ?? null) : null
  const draggedSection = activeType === 'section' && activeId ? activeId.slice(4) : null

  const addSection = (name: string) => {
    if (name.trim()) dispatch({ type: 'section/add', name })
    setDraftSection(null)
  }

  const near = nearLabel(day, today)

  return (
    <div className="view agenda">
      <header className="view__head agenda__head">
        <div className="agenda__kicker">
          <p className="view__kicker">{monthYear(day)}</p>
          {day !== today && (
            <button type="button" className="agenda__today" onClick={() => onSelectDay(today)}>
              Hoy
            </button>
          )}
        </div>
        <h1 className="view__title agenda__title">
          {near ?? capitalize(dayNameLong(day))}{' '}
          <span className="view__title-dim">{near ? `${dayNameLong(day)} ${dayNumber(day)}` : `${dayNumber(day)} ${monthLong(day)}`}</span>
        </h1>
      </header>

      <DndContext sensors={sensors} collisionDetection={scopedCollision} accessibility={{ announcements }} {...handlers}>
        <WeekStrip day={day} today={today} loads={loads} onSelect={onSelectDay} />
        <div className="view__progress" aria-hidden="true">
          <span style={{ transform: `scaleX(${progress.ratio})` }} />
        </div>

        <div key={day} className={`agenda__day ${direction}`}>
          {day === today && hasOverdue && (
            <section className="block">
              <BlockHeader
                label="Atrasadas"
                count={overdueIds.length}
                tone="danger"
                collapsed={state.collapsed.overdue}
                onToggle={() => dispatch({ type: 'block/toggle', block: 'overdue' })}
                action={
                  <button type="button" className="section__action" onClick={() => toToday()}>
                    Pasar a hoy
                  </button>
                }
              />
              {!state.collapsed.overdue && (
                <TaskColumn columnId={columnId(OVERDUE)} taskIds={overdueIds} droppable={false}>
                  {overdueIds.map((id) => {
                    const date = byId.get(id)?.date
                    return renderTask(id, null, { overdue: true, meta: date ? relativeLabel(date, today) : null })
                  })}
                </TaskColumn>
              )}
            </section>
          )}

          {rows.length > 0 && (
            <section className="block">
              <BlockHeader label="Horario" count={dayTasks.filter((task) => task.time && !task.done).length} />
              <Timeline rows={rows} day={day} sections={sections} />
            </section>
          )}

          {free && !showUntimed && (
            <div className="agenda__empty">
              <IconFeather size={26} />
              <p>{day < today ? 'Nada pendiente.' : 'Día libre.'}</p>
            </div>
          )}
          {showUntimed && (
            <section className="block">
              <BlockHeader
                label="Sin hora"
                count={pending(rootIds) + sections.reduce((sum, section) => sum + pending(columns[section.id] ?? []), 0)}
                action={
                  day < today && pendingOfDay.length > 0 ? (
                    <button type="button" className="section__action" onClick={() => toToday(pendingOfDay)}>
                      Pasar a hoy
                    </button>
                  ) : undefined
                }
              />
              <TaskColumn columnId={columnId(ROOT)} taskIds={rootIds} empty={free ? 'Día libre.' : rows.length ? 'Todo tiene hora.' : 'Nada sin hora.'}>
                {rootIds.map((id) => renderTask(id, null))}
              </TaskColumn>

              <SortableContext items={sections.map((section) => sectionDragId(section.id))} strategy={verticalListSortingStrategy}>
                {sections.map((section) => {
                  const ids = columns[section.id] ?? []
                  return (
                    <SectionBlock
                      key={section.id}
                      section={section}
                      taskIds={ids}
                      pending={pending(ids)}
                      onToggle={() => dispatch({ type: 'section/toggle', id: section.id })}
                      onOpen={() => onOpenSection(section.id)}
                    >
                      {ids.map((id) => renderTask(id, section.id))}
                    </SectionBlock>
                  )
                })}
              </SortableContext>

              {draftSection === null ? (
                <button type="button" className="view__add-section" onClick={() => setDraftSection('')}>
                  <IconPlus size={14} />
                  Sección
                </button>
              ) : (
                <input
                  className="view__section-input"
                  autoFocus
                  placeholder="Nombre de la sección"
                  value={draftSection}
                  onChange={(event) => setDraftSection(event.target.value)}
                  onBlur={() => addSection(draftSection)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') addSection(draftSection)
                    if (event.key === 'Escape') setDraftSection(null)
                  }}
                />
              )}
            </section>
          )}
        </div>

        <DragOverlay dropAnimation={{ duration: 180, easing: 'cubic-bezier(0.2,0.8,0.2,1)' }}>
          {dragged && (
            <div className="task-overlay">
              <TaskRow task={dragged} />
            </div>
          )}
          {draggedSection && (
            <div className="section-overlay">
              <p className="section__name">{sections.find((section) => section.id === draggedSection)?.name}</p>
            </div>
          )}
        </DragOverlay>
      </DndContext>
    </div>
  )
}
