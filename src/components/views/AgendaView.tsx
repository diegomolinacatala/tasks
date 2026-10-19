import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { createId } from '../../lib/id'
import { capitalize } from '../../lib/title'
import { DndContext, DragOverlay } from '@dnd-kit/core'
import type { DragMoveEvent } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import type { CalendarEvent, TimedEvent } from '../../lib/calendar'
import { canMoveEvent, eventSpan, movedStart } from '../../lib/calendar'
import { dayHeading, isoOfInstant, monthYear, relativeLabel, shortTime } from '../../lib/date'
import { spanLabel } from '../../lib/duration'
import { placementsOf } from '../../lib/order'
import { lastDay, shownDay } from '../../lib/period'
import { haptic } from '../../lib/platform/feedback'
import { routinesOn } from '../../lib/routines'
import type { SlotGap } from '../../lib/slot'
import { gapAround, slotBefore, slotIndexAt, suggestedStart, timeAt } from '../../lib/slot'
import { buildTimeline, timelineItems } from '../../lib/timeline'
import { useNowMinutes } from '../../hooks/useNow'
import { useCopy } from '../../state/LanguageProvider'
import { useAppState, useDispatch } from '../../state/StoreProvider'
import { eventDays as markedDays } from '../../lib/calendar'
import { useCalendar, useDayEvents } from '../calendar/CalendarProvider'
import { progressOf, tasksOn } from '../../state/selectors'
import type { IsoDate, Task } from '../../types'
import { announcements, pressCue, scopedCollision, useDragSensors } from '../dnd/dnd'
import { OVERDUE, ROOT, columnId, eventDragId, eventKeyOf, sectionDragId } from '../dnd/ids'
import { BlockHeader } from '../section/BlockHeader'
import { SectionBlock } from '../section/SectionBlock'
import { TaskColumn } from '../section/TaskColumn'
import { SortableTask } from '../task/SortableTask'
import { TaskRow } from '../task/TaskRow'
import { useTaskActions } from '../task/useTaskActions'
import { IconChevronDown, IconFeather, IconPlus } from '../ui/Icons'
import { useToast } from '../ui/Toast'
import { AllDayEvents } from './AllDayEvents'
import { SlotCard } from './SlotCard'
import type { DayLoad } from './StripDay'
import { Timeline } from './Timeline'
import type { TimelineSlot } from './Timeline'
import { WeekStrip } from './WeekStrip'
import type { DragType } from './useDayBoard'
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
    untitledEvent: 'Evento',
    eventNotMoved: 'No se ha podido mover el evento.',
    readonlyCalendar: 'Ese calendario es de solo lectura.',
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
    untitledEvent: 'Event',
    eventNotMoved: 'The event couldn’t be moved.',
    readonlyCalendar: 'That calendar is read-only.',
  },
} as const

/** Con cuántas atrasadas se plegó el bloque: si entran más, se vuelve a abrir solo. */
const OVERDUE_FOLDED_KEY = 'tasks:overdue-folded-at'

/** Dónde cae lo que se arrastra sobre el horario, mientras se arrastra y al soltar. */
interface SlotAt extends TimelineSlot {
  gap: SlotGap
}

/** Lo soltado en el horario, a la espera de su hora y su duración. */
type SlotCardState =
  | { type: 'task'; id: string; title: string; before: string; gap: SlotGap; start: number; duration: number | null }
  | { type: 'event'; key: string; title: string; before: string; gap: SlotGap; start: number; duration: number }

/** Las filas del horario que cuentan para saber entre cuáles cae el dedo (ni huecos, ni "ahora", ni lo que se arrastra). */
const ITEM_ROWS = ':scope > li:not(.tl--gap):not(.tl--now):not(.tl--slot):not(.tl--hint):not(.tl--card):not(.is-dragging)'

/**
 * Agenda, como Structured: arriba el día en el que estás y la tira de su semana, que se despliega
 * en el mes entero (tocando el mes o tirando de ella); debajo, lo atrasado (solo hoy), el horario con
 * lo que tiene hora y la lista de lo que no la tiene, con sus secciones. Una tarea se lleva a otro
 * día soltándola sobre él en la tira o en el mes, y se le pone hora soltándola en el horario entre
 * dos cosas: ahí mismo sale una tarjeta con la hora propuesta y la duración. Los eventos del
 * calendario del iPhone se mueven igual (a otro día o a otra hora) y su cuenta los sincroniza.
 */
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
  // El hueco del horario sobre el que va lo que se arrastra (en un ref para leerlo al soltar) y la
  // tarjeta de hora y duración de lo que se acaba de soltar ahí.
  const [slot, setSlot] = useState<TimelineSlot | null>(null)
  const slotRef = useRef<SlotAt | null>(null)
  const [card, setCard] = useState<SlotCardState | null>(null)

  // Volver a tocar la pestaña: el mes, recogido.
  useEffect(() => {
    if (resetSignal) setMonthOpen(false)
  }, [resetSignal])

  // Otro día: la tarjeta era del anterior.
  useEffect(() => setCard(null), [shown])

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

  const byId = useMemo(() => new Map(state.tasks.map((task) => [task.id, task])), [state.tasks])
  const dayTasks = useMemo(() => tasksOn(state, shown, today), [state, shown, today])
  // El calendario del iPhone, si está conectado: lo de todo el día encima y lo demás en el horario.
  const events = useDayEvents(shown)
  const calendar = useCalendar()
  const eventDays = useMemo(() => markedDays(calendar.events), [calendar.events])
  const dayRoutines = useMemo(() => routinesOn(state.routines, shown), [state.routines, shown])
  const items = useMemo(() => timelineItems(dayTasks, dayRoutines, events.timed), [dayTasks, dayRoutines, events.timed])
  // En un día que ya pasó, el tiempo libre no informa de nada.
  const rows = useMemo(() => {
    const built = buildTimeline(items, shown === today ? now : null)
    return shown < today ? built.filter((row) => row.kind !== 'gap') : built
  }, [items, shown, today, now])
  // El día en cuyo diario se tachan las rutinas: hoy, el de renovación (de madrugada puede ser ayer).
  const routinesDay = shown === today ? routineDay : shown
  const schedulePending = dayTasks.filter((task) => task.time && !task.done).length + dayRoutines.filter((routine) => routine.time && !routine.done.includes(routinesDay)).length
  const progress = progressOf(dayTasks)
  // Los eventos que se pueden coger: los de un calendario que se puede escribir, con hora, de este día.
  const movable = useCallback((event: CalendarEvent) => canMoveEvent(event, calendar.calendars, shown), [calendar.calendars, shown])

  /** Mover un evento del calendario: lo escribe iOS y su cuenta lo sincroniza; "Deshacer" lo devuelve. */
  const moveEvent = async (event: CalendarEvent, to: number, where: string) => {
    const result = await calendar.move(event, to)
    if (result !== 'moved') {
      toast({ message: result === 'readonly' ? copy.readonlyCalendar : copy.eventNotMoved, tone: 'error' })
      return
    }
    haptic('success')
    toast({
      message: `${event.title || copy.untitledEvent} → ${where}`,
      actionLabel: copy.undo,
      onAction: () => {
        // Ya empieza en `to`: así lo encuentra iOS para devolverlo.
        const moved = { ...event, start: to, end: to + (event.end - event.start) }
        void calendar.move(moved, event.start).then((undone) => {
          if (undone !== 'moved') toast({ message: copy.eventNotMoved, tone: 'error' })
        })
      },
    })
  }

  const timedEvent = (key: string | null): TimedEvent | undefined => events.timed.find((item) => item.event.key === key)

  const moveEventToDay = (key: string | null, date: IsoDate) => {
    const timed = timedEvent(key)
    if (!timed || isoOfInstant(timed.event.start) === date) return
    void moveEvent(timed.event, movedStart(timed.event, date), capitalize(relativeLabel(date, today)))
  }

  /** Soltado en el horario: la tarjeta aparece en el hueco donde estaba el dedo. */
  const dropOnTimeline = (id: string, type: DragType) => {
    const at = slotRef.current
    if (!at) return
    const { before, gap, start } = at
    if (type === 'task') {
      const task = byId.get(id)
      if (!task || task.done) return
      // Una que ya tenía hora conserva lo que duraba, salvo que se elija otra cosa.
      setCard({ type: 'task', id, title: task.title, before, gap, start, duration: task.time ? task.duration : null })
      return
    }
    const timed = timedEvent(eventKeyOf(id))
    if (!timed) return
    setCard({ type: 'event', key: timed.event.key, title: timed.event.title || copy.untitledEvent, before, gap, start, duration: timed.end - timed.start })
  }

  const { columns, hasOverdue, sections, activeId, activeType, handlers } = useDayBoard(shown, today, {
    onDay: (id, type, date) => (type === 'event' ? moveEventToDay(eventKeyOf(id), date) : moveToDay(id, date)),
    onTimeline: dropOnTimeline,
  })

  /** En qué hueco del horario está lo que se arrastra: entre qué dos filas cae el centro de lo cogido. */
  const slotAt = (event: DragMoveEvent): SlotAt | null => {
    if (event.over?.data.current?.type !== 'timeline') return null
    const type = event.active.data.current?.type
    const id = String(event.active.id)
    if (type === 'task' ? (byId.get(id)?.done ?? true) : type !== 'event') return null
    // Lo que se arrastra no cuenta: ni su fila (va atenuada en su sitio) ni su hueco.
    const rest = items.filter((item) => item.id !== id)
    const list = below.current?.querySelector('.timeline')
    const rects = list ? [...list.querySelectorAll<HTMLElement>(ITEM_ROWS)].map((node) => node.getBoundingClientRect()) : []
    const rect = event.active.rect.current.translated
    const index = slotIndexAt(rect ? rect.top + rect.height / 2 : 0, rects)
    const gap = gapAround(rest, index)
    return { before: slotBefore(rest, index), gap, start: suggestedStart(gap, shown === today ? now : null) }
  }

  const onDragMove = (event: DragMoveEvent) => {
    const next = slotAt(event)
    slotRef.current = next
    setSlot((current) => (current?.before === next?.before && current?.start === next?.start ? current : next && { before: next.before, start: next.start }))
  }

  const clearSlot = () => {
    slotRef.current = null
    setSlot(null)
  }

  /** "Listo" en la tarjeta: la tarea pasa al horario (con deshacer); un evento, a su hora nueva. */
  const confirmCard = (start: number, duration: number | null) => {
    if (!card) return
    setCard(null)
    const time = timeAt(start)
    if (card.type === 'event') {
      const timed = timedEvent(card.key)
      if (!timed) return
      const to = movedStart(timed.event, shown, start)
      // A la misma hora no hay nada que escribir (ni que deshacer).
      if (to !== timed.event.start) void moveEvent(timed.event, to, shortTime(time))
      return
    }
    const task = byId.get(card.id)
    if (!task) return
    const before = placementsOf(state.tasks, [task.id])
    const reminderId = createId()
    dispatch({ type: 'task/schedule', id: task.id, date: shown, time, duration, reminderId })
    haptic('success')
    toast({
      // En un día que ya pasó nace atrasada: se dice, como al soltarla en la tira.
      message: `${task.title} · ${spanLabel(time, duration)}${shown < today ? copy.lateTag : ''}`,
      actionLabel: copy.undo,
      onAction: () => {
        dispatch({ type: 'tasks/place', placements: before })
        dispatch({ type: 'task/setTime', id: task.id, time: task.time })
        if (task.time) dispatch({ type: 'task/setDuration', id: task.id, duration: task.duration })
        dispatch({ type: 'reminder/remove', taskId: task.id, reminderId })
      },
    })
  }

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
  // El horario sale también vacío mientras se arrastra una tarea o un evento (para soltarlo ahí; una
  // sección no tiene hora) o con la tarjeta abierta.
  const showSchedule = rows.length > 0 || (dragDay !== null && activeType !== 'section') || card !== null

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
  const draggedEvent = activeType === 'event' && activeId ? events.timed.find((item) => eventDragId(item.event.key) === activeId) : undefined

  // Intro o tocar fuera con un nombre la crean (con deshacer); Escape o vacío, nada.
  const addSection = (name: string) => {
    setDraftSection(null)
    if (!name.trim()) return
    const id = createId()
    dispatch({ type: 'section/add', name, id })
    toast({ message: copy.sectionAdded(name.trim()), actionLabel: copy.undo, onAction: () => dispatch({ type: 'section/remove', id }) })
  }

  const heading = dayHeading(day, today)

  const cardNode = card ? (
    <SlotCard
      key={`${card.type === 'task' ? card.id : card.key}:${card.before}`}
      title={card.title}
      start={card.start}
      gap={card.gap}
      initialDuration={card.type === 'task' ? card.duration : null}
      fixedDuration={card.type === 'event' ? card.duration : undefined}
      onConfirm={confirmCard}
      onCancel={() => setCard(null)}
    />
  ) : null

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
          setCard(null)
          handlers.onDragStart(event)
        }}
        onDragMove={onDragMove}
        onDragOver={handlers.onDragOver}
        onDragEnd={(event) => {
          handlers.onDragEnd(event)
          clearSlot()
          setDragDay(null)
        }}
        onDragCancel={() => {
          handlers.onDragCancel()
          clearSlot()
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

            {showSchedule && (
              <section className="block">
                <BlockHeader label={copy.schedule} count={schedulePending} />
                <Timeline
                  rows={rows}
                  day={shown}
                  routineDay={routinesDay}
                  sections={sections}
                  now={shown === today ? now : null}
                  past={shown < today}
                  dragging={dragDay !== null}
                  slot={slot}
                  card={card && cardNode ? { before: card.before, node: cardNode } : null}
                  movable={movable}
                />
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
          {draggedEvent && (
            <div className="task-overlay tl-overlay cal-tone" style={{ '--cal': draggedEvent.event.color } as CSSProperties}>
              <span className="tl-overlay__bar" aria-hidden="true" />
              <span>
                <span className="tl-overlay__title">{draggedEvent.event.title || copy.untitledEvent}</span>
                <span className="tl-overlay__meta">{eventSpan(draggedEvent)}</span>
              </span>
            </div>
          )}
        </DragOverlay>
      </DndContext>
    </div>
  )
}
