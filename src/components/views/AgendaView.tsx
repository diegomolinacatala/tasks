import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import { createId } from '../../lib/id'
import { capitalize } from '../../lib/title'
import { DndContext, DragOverlay } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { dayHeading, monthYear, relativeLabel } from '../../lib/date'
import { lastDay, shownDay } from '../../lib/period'
import { haptic } from '../../lib/platform/feedback'
import { routinesOn } from '../../lib/routines'
import { buildTimeline, timelineItems } from '../../lib/timeline'
import { useNowMinutes } from '../../hooks/useNow'
import { useCopy } from '../../state/LanguageProvider'
import { useAppState, useDispatch } from '../../state/StoreProvider'
import { eventDays as markedDays } from '../../lib/calendar'
import { useCalendar, useDayEvents } from '../calendar/CalendarProvider'
import { progressOf, tasksOn } from '../../state/selectors'
import type { IsoDate, Task } from '../../types'
import { announcements, pressCue, scopedCollision, useDragSensors } from '../dnd/dnd'
import { OVERDUE, ROOT, columnId, sectionDragId } from '../dnd/ids'
import { BlockHeader } from '../section/BlockHeader'
import { SectionBlock } from '../section/SectionBlock'
import { TaskColumn } from '../section/TaskColumn'
import { SortableTask } from '../task/SortableTask'
import { TaskRow } from '../task/TaskRow'
import { useTaskActions } from '../task/useTaskActions'
import { IconChevronDown, IconFeather, IconPlus } from '../ui/Icons'
import { useToast } from '../ui/Toast'
import { AllDayEvents } from './AllDayEvents'
import type { DayLoad } from './StripDay'
import { Timeline } from './Timeline'
import { WeekStrip } from './WeekStrip'
import { useDayBoard } from './useDayBoard'
import './views.css'
import './agenda.css'

interface AgendaViewProps {
  day: IsoDate
  today: IsoDate
  /** Hoy para las rutinas: puede ir por detrás del calendario si su día empieza de madrugada. */
  routineDay: IsoDate
  /** Cambia al volver a tocar la pestaña: todo a su sitio (el mes recogido). */
  resetSignal?: number
  onSelectDay: (day: IsoDate) => void
  onOpenSection: (id: string) => void
  /** El + de una sección: escribir una tarea directamente en ella, en el día que se mira. */
  onAddToSection: (id: string) => void
}

const COPY = {
  es: {
    undo: 'Deshacer',
    month: (label: string, open: boolean) => `${label}: ${open ? 'recoger el mes' : 'desplegar el mes'}`,
    today: 'Hoy',
    overdue: 'Atrasadas',
    toToday: 'Pasar a hoy',
    moveCount: (count: number) => (count === 1 ? 'Pasar 1 a hoy' : `Pasar ${count} a hoy`),
    schedule: 'Horario',
    nothingPending: 'Nada pendiente.',
    free: 'Día libre.',
    noTasks: 'Sin tareas.',
    untimed: 'Sin hora',
    noneUntimed: 'Nada sin hora.',
    section: 'Sección',
    sectionName: 'Nombre de la sección',
    sectionAdded: (name: string) => `Sección ${name}`,
    lateTag: ' (atrasada)',
    noPeriodTag: ' (sin plazo)',
  },
  en: {
    undo: 'Undo',
    month: (label: string, open: boolean) => `${label}: ${open ? 'collapse the month' : 'expand the month'}`,
    today: 'Today',
    overdue: 'Overdue',
    toToday: 'Move to today',
    moveCount: (count: number) => (count === 1 ? 'Move 1 to today' : `Move ${count} to today`),
    schedule: 'Schedule',
    nothingPending: 'Nothing pending.',
    free: 'Free day.',
    noTasks: 'No tasks.',
    untimed: 'No time',
    noneUntimed: 'Nothing without a time.',
    section: 'Section',
    sectionName: 'Section name',
    sectionAdded: (name: string) => `Section ${name}`,
    lateTag: ' (overdue)',
    noPeriodTag: ' (no time frame)',
  },
} as const

/**
 * Agenda, como Structured: arriba el día en el que estás y la tira de su semana, que se despliega
 * en el mes entero (tocando el mes o tirando de ella); debajo, lo atrasado (solo hoy), el horario con
 * lo que tiene hora y la lista de lo que no la tiene, con sus secciones. Una tarea se lleva a otro
 * día soltándola sobre él en la tira o en el mes.
 */
/** Con cuántas atrasadas se plegó el bloque: si entran más, se vuelve a abrir solo. */
const OVERDUE_FOLDED_KEY = 'tasks:overdue-folded-at'

export function AgendaView({ day, today, routineDay, resetSignal = 0, onSelectDay, onOpenSection, onAddToSection }: AgendaViewProps) {
  const state = useAppState()
  const dispatch = useDispatch()
  const toast = useToast()
  const sensors = useDragSensors()
  const copy = useCopy(COPY)
  const { toToday } = useTaskActions()
  // La cabecera y la tira cambian de día al momento; lo de debajo (el horario, las filas) se prepara
  // sin bloquear: en un móvil modesto, el toque responde aunque pintar el día nuevo cueste.
  const deferred = useDeferredValue(day)
  // Mientras se arrastra, el día de debajo no cambia: el gesto y lo que se confirma al soltar son de él.
  const [dragDay, setDragDay] = useState<IsoDate | null>(null)
  const shown = dragDay ?? deferred
  const stale = shown !== day
  const now = useNowMinutes(shown === today)
  const [draftSection, setDraftSection] = useState<string | null>(null)
  // La tira desplegada en el mes entero.
  const [monthOpen, setMonthOpen] = useState(false)
  const below = useRef<HTMLDivElement>(null)

  // Volver a tocar la pestaña: el mes, recogido.
  useEffect(() => {
    if (resetSignal) setMonthOpen(false)
  }, [resetSignal])

  const moveToDay = (taskId: string, date: IsoDate) => {
    const task = state.tasks.find((item) => item.id === taskId)
    if (!task || shownDay(task, today) === date) return
    dispatch({ type: 'task/move', id: taskId, date, sectionId: task.sectionId })
    haptic('success')
    // A un día pasado nace atrasada; fuera de su plazo lo pierde: se dice.
    const tag = date < today ? copy.lateTag : task.until && date > task.until ? copy.noPeriodTag : ''
    toast({
      message: `${task.title} → ${capitalize(relativeLabel(date, today))}${tag}`,
      actionLabel: copy.undo,
      onAction: () => dispatch({ type: 'task/move', id: taskId, date: task.date, sectionId: task.sectionId, until: task.until }),
    })
  }

  const { columns, hasOverdue, sections, activeId, activeType, handlers } = useDayBoard(shown, today, moveToDay)

  const byId = useMemo(() => new Map(state.tasks.map((task) => [task.id, task])), [state.tasks])
  const dayTasks = useMemo(() => tasksOn(state, shown, today), [state, shown, today])
  // El calendario del iPhone, si está conectado: lo de todo el día encima y lo demás en el horario.
  const events = useDayEvents(shown)
  const calendar = useCalendar()
  const eventDays = useMemo(() => markedDays(calendar.events), [calendar.events])
  const dayRoutines = useMemo(() => routinesOn(state.routines, shown), [state.routines, shown])
  // En un día que ya pasó, el tiempo libre no informa de nada.
  const rows = useMemo(() => {
    const built = buildTimeline(timelineItems(dayTasks, dayRoutines, events.timed), shown === today ? now : null)
    return shown < today ? built.filter((row) => row.kind !== 'gap') : built
  }, [dayTasks, dayRoutines, events.timed, shown, today, now])
  // El día en cuyo diario se tachan las rutinas: hoy, el de renovación (de madrugada puede ser ayer).
  const routinesDay = shown === today ? routineDay : shown
  const schedulePending = dayTasks.filter((task) => task.time && !task.done).length + dayRoutines.filter((routine) => routine.time && !routine.done.includes(routinesDay)).length
  const progress = progressOf(dayTasks)

  // Lo que hay cada día, para los anillos de la tira y del mes desplegado. Los días que no cambian
  // conservan su objeto: así solo se repinta el día tocado.
  const previousLoads = useRef<ReadonlyMap<IsoDate, DayLoad>>(new Map())
  const loads = useMemo(() => {
    const counts = new Map<IsoDate, DayLoad>()
    for (const task of state.tasks) {
      const day = shownDay(task, today)
      if (!day) continue
      const load = counts.get(day) ?? { total: 0, done: 0 }
      counts.set(day, { total: load.total + 1, done: load.done + (task.done ? 1 : 0) })
    }
    const map = new Map<IsoDate, DayLoad>()
    for (const [date, load] of counts) {
      const before = previousLoads.current.get(date)
      map.set(date, before && before.total === load.total && before.done === load.done ? before : load)
    }
    return map
  }, [state.tasks, today])
  useEffect(() => {
    previousLoads.current = loads
  }, [loads])

  // Hacia dónde se mueve el día: el contenido entra por ese lado. Se compara con el último día
  // pintado, que se apunta después de pintar (en el render aún es el anterior).
  const previousDay = useRef(shown)
  const direction = shown > previousDay.current ? 'is-next' : shown < previousDay.current ? 'is-prev' : ''
  useEffect(() => {
    previousDay.current = shown
  }, [shown])

  const overdueIds = columns[OVERDUE] ?? []
  const rootIds = columns[ROOT] ?? []
  const pending = (ids: string[]) => ids.filter((id) => !byId.get(id)?.done).length
  const untimedCount = rootIds.length + sections.reduce((sum, section) => sum + (columns[section.id]?.length ?? 0), 0)
  const pendingOfDay = dayTasks.filter((task) => !task.done).map((task) => task.id)
  // Un día sin tareas ni eventos con hora es un día libre, aunque tenga rutinas (o un cumpleaños). Hoy
  // siempre enseña su lista (y sus secciones, donde soltar y desde donde crear una); otro día, solo si
  // tiene algo sin hora.
  const free = !dayTasks.length && !events.timed.length && !(shown === today && hasOverdue)
  const timedTasks = dayTasks.some((task) => task.time)
  // Un día libre no enseña un bloque "Sin hora" vacío (ni hoy): solo que está libre.
  const showUntimed = untimedCount > 0 || (shown === today && !free)

  // Plegado con una atrasada y semanas después hay nueve: si entran más de las que había al plegar, se abre solo.
  const overdueCount = (columns[OVERDUE] ?? []).length
  useEffect(() => {
    if (!state.collapsed.overdue || shown !== today) return
    let folded = 0
    try {
      folded = Number(localStorage.getItem(OVERDUE_FOLDED_KEY)) || 0
    } catch {
      return
    }
    if (overdueCount > folded) dispatch({ type: 'block/toggle', block: 'overdue' })
  }, [overdueCount, state.collapsed.overdue, shown, today, dispatch])
  const toggleOverdue = () => {
    if (!state.collapsed.overdue) {
      try {
        localStorage.setItem(OVERDUE_FOLDED_KEY, String(overdueCount))
      } catch {
        // Sin localStorage, el pliegue no se recuerda: se abre con cualquier cambio.
      }
    }
    dispatch({ type: 'block/toggle', block: 'overdue' })
  }

  const renderTask = (id: string, sectionId: string | null, options: { overdue?: boolean; meta?: string | null } = {}) => {
    const task = byId.get(id)
    if (!task) return null
    return (
      <SortableTask
        key={id}
        task={task}
        sectionId={sectionId}
        overdue={options.overdue ?? (shown < today && !task.done)}
        meta={options.meta}
        dropDisabled={options.overdue}
      />
    )
  }

  const dragged: Task | null = activeType === 'task' && activeId ? (byId.get(activeId) ?? null) : null
  const draggedSection = activeType === 'section' && activeId ? activeId.slice(4) : null

  // Intro o tocar fuera con un nombre la crean (con deshacer); Escape o vacío, nada.
  const addSection = (name: string) => {
    setDraftSection(null)
    if (!name.trim()) return
    const id = createId()
    dispatch({ type: 'section/add', name, id })
    toast({ message: copy.sectionAdded(name.trim()), actionLabel: copy.undo, onAction: () => dispatch({ type: 'section/remove', id }) })
  }

  const heading = dayHeading(day, today)

  return (
    <div className={`view agenda ${dragDay ? 'is-dragging' : ''}`}>
      <header className="view__head agenda__head">
        <div className="agenda__kicker">
          <button
            type="button"
            className={`agenda__month ${monthOpen ? 'is-open' : ''}`}
            aria-expanded={monthOpen}
            aria-label={copy.month(monthYear(day), monthOpen)}
            onClick={() => setMonthOpen((open) => !open)}
          >
            <span className="view__kicker">{monthYear(day)}</span>
            <IconChevronDown size={13} strokeWidth={2.2} />
          </button>
          {/* Un día pasado con pendientes (con hora o sin ella): todo a hoy, desde la cabecera */}
          {shown < today && pendingOfDay.length > 0 && (
            <button type="button" className="agenda__today agenda__today--move" onClick={() => toToday(pendingOfDay)}>
              {copy.moveCount(pendingOfDay.length)}
            </button>
          )}
          {day !== today && (
            <button type="button" className="agenda__today" onClick={() => onSelectDay(today)}>
              {copy.today}
            </button>
          )}
        </div>
        <h1 className="view__title agenda__title">
          {heading.main} <span className="view__title-dim">{heading.rest}</span>
        </h1>
      </header>

      <DndContext
        sensors={sensors}
        collisionDetection={scopedCollision}
        onDragPending={pressCue.onDragPending}
        onDragAbort={pressCue.onDragAbort}
        accessibility={{ announcements }}
        onDragStart={(event) => {
          setDragDay(shown)
          handlers.onDragStart(event)
        }}
        onDragOver={handlers.onDragOver}
        onDragEnd={(event) => {
          handlers.onDragEnd(event)
          setDragDay(null)
        }}
        onDragCancel={() => {
          handlers.onDragCancel()
          setDragDay(null)
        }}
      >
        <WeekStrip
          day={day}
          today={today}
          loads={loads}
          eventDays={eventDays}
          open={monthOpen}
          onOpenChange={setMonthOpen}
          onSelect={onSelectDay}
          follower={below}
        />
        {/* Lo de debajo de la tira va en un bloque: sube y baja con ella al desplegar el mes. */}
        <div ref={below} className={`agenda__below ${stale ? 'is-stale' : ''}`}>
          <div className="view__progress" aria-hidden="true">
            <span style={{ transform: `scaleX(${progress.ratio})` }} />
          </div>

          <div key={shown} className={`agenda__day ${direction}`}>
            <AllDayEvents events={events.allDay} />
            {shown === today && hasOverdue && (
              <section className="block">
                <BlockHeader
                  label={copy.overdue}
                  count={overdueIds.length}
                  tone="danger"
                  collapsed={state.collapsed.overdue}
                  onToggle={toggleOverdue}
                  action={
                    <button type="button" className="section__action" onClick={() => toToday()}>
                      {copy.toToday}
                    </button>
                  }
                />
                {!state.collapsed.overdue && (
                  <TaskColumn columnId={columnId(OVERDUE)} taskIds={overdueIds} droppable={false}>
                    {overdueIds.map((id) => {
                      const task = byId.get(id)
                      const date = task ? lastDay(task) : null
                      return renderTask(id, null, { overdue: true, meta: date ? relativeLabel(date, today) : null })
                    })}
                  </TaskColumn>
                )}
              </section>
            )}

            {rows.length > 0 && (
              <section className="block">
                <BlockHeader label={copy.schedule} count={schedulePending} />
                <Timeline rows={rows} day={shown} routineDay={routinesDay} sections={sections} now={shown === today ? now : null} past={shown < today} />
              </section>
            )}

            {free && !showUntimed && (
              <div className="agenda__empty">
                <IconFeather size={26} />
                <p>{shown < today ? copy.nothingPending : rows.length > 0 ? copy.noTasks : copy.free}</p>
              </div>
            )}
            {showUntimed && (
              <section className="block">
                <BlockHeader label={copy.untimed} count={pending(rootIds) + sections.reduce((sum, section) => sum + pending(columns[section.id] ?? []), 0)} />
                {/* La nota de vacío solo cuando el bloque entero está vacío: con secciones con tareas, nada */}
                <TaskColumn columnId={columnId(ROOT)} taskIds={rootIds} empty={untimedCount === 0 && !timedTasks && !free ? copy.noneUntimed : null}>
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
                        onAdd={() => {
                          // Lo que se escriba va a parar aquí: que se vea al añadirlo.
                          if (section.collapsed) dispatch({ type: 'section/toggle', id: section.id })
                          onAddToSection(section.id)
                        }}
                      >
                        {ids.map((id) => renderTask(id, section.id))}
                      </SectionBlock>
                    )
                  })}
                </SortableContext>

                {draftSection === null ? (
                  <button type="button" className="view__add-section" onClick={() => setDraftSection('')}>
                    <IconPlus size={14} />
                    {copy.section}
                  </button>
                ) : (
                  <input
                    className="view__section-input"
                    autoFocus
                    placeholder={copy.sectionName}
                    value={draftSection}
                    onChange={(event) => setDraftSection(event.target.value)}
                    enterKeyHint="done"
                    maxLength={60}
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
