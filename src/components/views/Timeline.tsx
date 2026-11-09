import { Fragment, Suspense, lazy, memo, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import { useDraggable, useDroppable } from '@dnd-kit/core'
import type { CalendarEvent } from '../../lib/calendar'
import { eventSpan } from '../../lib/calendar'
import { spanLabel } from '../../lib/duration'
import { importanceScale } from '../../lib/importance'
import { asOf, periodTag } from '../../lib/period'
import { placeTriggerOf } from '../../lib/places'
import { nextReminderAt } from '../../lib/reminders'
import { daysLabel } from '../../lib/routines'
import type { TimelineItem, TimelineRow } from '../../lib/timeline'
import { clockOf, freeLabel } from '../../lib/timeline'
import { useCopy } from '../../state/LanguageProvider'
import type { IsoDate, Routine, Section, Task } from '../../types'
import { useCalendar } from '../calendar/CalendarProvider'
import { splitListeners } from '../dnd/dnd'
import { eventDragId, timelineDropId } from '../dnd/ids'
import { useCurrentDay } from '../../hooks/useToday'
import { useSizing } from '../importance/sizing'
import { SwipeRow } from '../task/SwipeRow'
import { useRowActions } from '../task/rowActions'
import { IconBell, IconCheck, IconPlace, IconRepeat } from '../ui/Icons'
import './agenda.css'
import './slot.css'

const ImportanceKnob = lazy(() =>
  import('../importance/ImportanceKnob').then((module) => ({ default: module.ImportanceKnob })),
)

/** Alto de la cápsula por minuto de duración, entre un círculo y un tope. */
const PX_PER_MINUTE = 0.75
const NODE_PX = 24
const MAX_NODE_PX = 104

const COPY = {
  es: {
    schedule: 'Horario',
    now: (clock: string) => `Ahora, ${clock}`,
    undone: (title: string) => `Marcar «${title}» como pendiente`,
    complete: (title: string) => `Completar «${title}»`,
    unmark: (title: string) => `Desmarcar «${title}»`,
    doneRoutine: (title: string) => `Hecha: «${title}»`,
    untitled: 'Evento',
    event: (title: string, span: string, calendar: string) => `${title}, ${span}${calendar ? `, calendario ${calendar}` : ''}. Abrir en Calendario`,
    dropHint: 'Suelta aquí para ponerle hora',
    together: 'A la vez',
  },
  en: {
    schedule: 'Schedule',
    now: (clock: string) => `Now, ${clock}`,
    undone: (title: string) => `Mark “${title}” as pending`,
    complete: (title: string) => `Complete “${title}”`,
    unmark: (title: string) => `Unmark “${title}”`,
    doneRoutine: (title: string) => `Done: “${title}”`,
    untitled: 'Event',
    event: (title: string, span: string, calendar: string) => `${title}, ${span}${calendar ? `, ${calendar} calendar` : ''}. Open in Calendar`,
    dropHint: 'Drop here to give it a time',
    together: 'At the same time',
  },
} as const

/** La hora de la columna; en inglés, AM y PM debajo, en pequeño, para que quepa en su sitio. */
export function Clock({ minutes }: { minutes: number }) {
  const [time, meridiem] = clockOf(minutes).split(' ')
  return (
    <>
      {time}
      {meridiem && <small className="tl__meridiem">{meridiem}</small>}
    </>
  )
}

const nodeHeight = (minutes: number) => Math.round(Math.min(MAX_NODE_PX, Math.max(NODE_PX, minutes * PX_PER_MINUTE)))

/** El tiempo libre crece un poco con lo que dura (como las cápsulas), entre el alto de siempre y un tope. */
const GAP_PX = 34
const MAX_GAP_PX = 90
const GAP_PX_PER_MINUTE = 0.25
const gapHeight = (minutes: number) => Math.round(Math.min(MAX_GAP_PX, GAP_PX + Math.max(0, minutes - 60) * GAP_PX_PER_MINUTE))

/** Dónde caería lo que se arrastra: a qué hora y a qué altura se pinta la marca (px desde arriba de la zona). */
export interface TimelineSlot {
  start: number
  y: number
}

interface TimelineProps {
  rows: TimelineRow[]
  day: IsoDate
  sections: readonly Section[]
  /** Minutos de ahora si el día es hoy (lo que ya acabó se apaga); `null` otro día. */
  now: number | null
  /** El día ya pasó: sus eventos, apagados; sus tareas pendientes, atrasadas. */
  past: boolean
  /** El día de las rutinas (puede ir por detrás del calendario de madrugada): hoy, el de renovación. */
  routineDay?: IsoDate
  /** Se está arrastrando algo por la Agenda: el horario acepta soltarlo a la altura del dedo. */
  dragging?: boolean
  /** Dónde caería ahora mismo lo que se arrastra; `null` si no está encima. */
  slot?: TimelineSlot | null
  /** Ya soltado: la tarjeta de hora y duración, delante de la fila `before` (o al final). */
  card?: { before: string; node: ReactNode } | null
  /** Qué eventos del calendario se pueden coger (los de un calendario que se puede escribir). */
  movable?: (event: CalendarEvent) => boolean
  /** Claves de los eventos marcados como hechos en Tasks (`settings.calendar.done`). */
  doneEvents: ReadonlySet<string>
  /** Marcar o desmarcar un evento como hecho (solo en la app: el calendario no se toca). Estable entre renders. */
  onToggleEvent: (key: string, done: boolean) => void
}

/**
 * Lo que tiene hora, a lo largo de una línea: una cápsula por tarea, tan alta como lo que dura, que
 * se rellena al completarla; entre medias, el tiempo libre; y hoy, una marca en el momento actual. Lo
 * que coincide en el tiempo va en paralelo, en carriles uno al lado del otro. Los eventos del
 * calendario del iPhone van en la misma línea, con el color de su calendario: se tachan como las
 * tareas, pero solo en la app (el calendario no se entera); tocarlos abre su ficha de Calendario y
 * mantenerlos pulsados los coge para llevarlos a otro día o a otra hora. Mientras se arrastra algo por
 * encima, una marca de coñac dice a qué hora caería (`slot`, a la altura del dedo); al soltar, la
 * tarjeta (`card`) aparece en su sitio.
 */
export function Timeline({ rows, day, sections, now, past, routineDay = day, dragging = false, slot = null, card = null, movable, doneEvents, onToggleEvent }: TimelineProps) {
  const copy = useCopy(COPY)
  const calendar = useCalendar()
  // La marca (`slot`) ya dice que se está encima: no hace falta más señal.
  const { setNodeRef } = useDroppable({ id: timelineDropId(day), data: { type: 'timeline' } })

  // La tarjeta ya es una fila (`SlotCard` pinta su `li`): solo hay que colocarla.
  const cardRow = card ? <Fragment key="card">{card.node}</Fragment> : null

  // Hoy el tiempo libre se mide desde ahora y encoge: si el de delante del que iba la tarjeta ya no está,
  // va delante de lo que venía detrás de él.
  const cardBefore = card && !rows.some((row) => row.id === card.before) && card.before.startsWith('gap:') ? card.before.slice(4) : card?.before
  const list: ReactNode[] = []
  let cardPlaced = false
  for (const row of rows) {
    if (cardBefore === row.id) {
      list.push(cardRow)
      cardPlaced = true
    }
    list.push(renderRow(row))
  }
  // Detrás de todo; también si lo que tenía delante ya no está (se tachó o se borró con la tarjeta abierta).
  if (cardRow && !cardPlaced) list.push(cardRow)
  // Un horario vacío mientras se arrastra: dónde soltar (con la marca encima, la nota se aparta).
  if (!rows.length && dragging && !card) {
    list.push(
      <li key="hint" className={`tl tl--hint ${slot ? 'is-armed' : ''}`} aria-hidden="true">
        <span className="tl__time" />
        <span className="tl__rail">
          <span className="tl__slot-dot" />
        </span>
        <span className="tl__hint">{copy.dropHint}</span>
      </li>,
    )
  }

  function renderItem(item: TimelineItem, parallel: boolean): ReactNode {
    // Cada fila dice de qué hora a qué hora va: a su altura se lee la hora al soltar algo.
    const from = item.start
    const to = item.end
    if (item.kind === 'routine')
      return <TimelineRoutine key={item.id} routine={item.routine} day={routineDay} start={item.start} from={from} to={to} parallel={parallel} />
    if (item.kind === 'event')
      return (
        <TimelineEvent
          key={item.id}
          event={item.event}
          start={item.start}
          end={item.end}
          live={item.live}
          over={past || (now !== null && item.end <= now && item.end > item.start)}
          calendar={calendar.calendars.find((entry) => entry.id === item.event.calendarId)?.title ?? ''}
          movable={movable?.(item.event) ?? false}
          done={doneEvents.has(item.event.key)}
          onOpen={calendar.open}
          onToggle={onToggleEvent}
          from={from}
          to={to}
        />
      )
    const section = item.task.sectionId ? sections.find((entry) => entry.id === item.task.sectionId) : undefined
    return (
      <TimelineTask
        key={item.id}
        task={item.task}
        start={item.start}
        live={item.live}
        section={section?.name}
        overdue={past && !item.task.done}
        from={from}
        to={to}
        parallel={parallel}
      />
    )
  }

  function renderRow(row: TimelineRow): ReactNode {
    if (row.kind === 'gap')
      return (
        <li
          key={row.id}
          className="tl tl--gap"
          aria-hidden="true"
          data-from={row.start}
          data-to={row.end}
          style={{ '--gap-h': `${gapHeight(row.minutes)}px` } as CSSProperties}
        >
          <span className="tl__time" />
          <span className="tl__rail" />
          <span className="tl__free">{freeLabel(row.minutes)}</span>
        </li>
      )
    if (row.kind === 'now')
      return (
        <li key="now" className="tl tl--now" aria-label={copy.now(clockOf(row.minutes))} data-from={row.minutes} data-to={row.minutes}>
          <span className="tl__time">
            <Clock minutes={row.minutes} />
          </span>
          <span className="tl__rail">
            <i className="tl__now-dot" />
          </span>
          <span className="tl__now-line" />
        </li>
      )
    if (row.kind === 'cluster')
      return (
        <li key={row.id} className="tl tl--cluster" data-from={row.start} data-to={row.end}>
          <span className="tl__time">
            <Clock minutes={row.start} />
          </span>
          <span className="tl__rail">
            <i className="tl__fork" />
          </span>
          <div className="tl__lanes" role="group" aria-label={copy.together} style={{ '--lanes': row.lanes.length } as CSSProperties}>
            {row.lanes.map((lane) => (
              <ul key={lane[0]?.id} className="tl__lane">
                {lane.map((item) => renderItem(item, true))}
              </ul>
            ))}
          </div>
        </li>
      )
    return renderItem(row, false)
  }

  return (
    <div ref={setNodeRef} className={`timeline-zone ${dragging ? 'is-dragging' : ''}`}>
      <ol className="timeline" aria-label={copy.schedule}>
        {list}
      </ol>
      {slot && dragging && (
        <div className="tl tl--slot" aria-hidden="true" style={{ '--y': `${slot.y}px` } as CSSProperties}>
          <span className="tl__time">
            <Clock minutes={slot.start} />
          </span>
          <span className="tl__rail">
            <span className="tl__slot-dot" />
          </span>
          <span className="tl__slot-line" />
        </div>
      )}
    </div>
  )
}

interface TimelineTaskProps {
  task: Task
  start: number
  /** De 0 a 1 si está en curso. */
  live?: number
  section?: string
  /** Pendiente de un día que ya pasó: en ladrillo, como en Atrasadas. */
  overdue?: boolean
  /** De qué minuto a qué minuto va la fila (para leer la hora a la altura del dedo al soltar algo). */
  from?: number
  to?: number
  /** En un carril, junto a lo que coincide: su hora va con el resto (no hay columna de la hora). */
  parallel?: boolean
}

/** El tramo de una fila para `SwipeRow`, si lo tiene. */
const spanOf = (from?: number, to?: number): readonly [number, number] | undefined => (from !== undefined && to !== undefined ? [from, to] : undefined)

const TimelineTask = memo(function TimelineTask({ task, start, live, section, overdue, from, to, parallel = false }: TimelineTaskProps) {
  const actions = useRowActions()
  const sizing = useSizing()
  const copy = useCopy(COPY)
  const [sizingTo, setSizingTo] = useState<number | null>(null)
  // Mantenerla pulsada la coge para soltarla en otro día de la tira (conserva su hora) o en otro
  // hueco del horario (cambia de hora).
  const { listeners, setNodeRef, isDragging } = useDraggable({ id: task.id, data: { type: 'task' }, disabled: sizing })
  const { hold } = splitListeners(listeners)
  const duration = task.duration ?? 0
  const scale = task.done ? 0 : importanceScale(sizingTo ?? task.importance)
  const today = useCurrentDay()
  const reminding = nextReminderAt(asOf(task, today), Date.now()) !== null
  const placed = task.done ? null : placeTriggerOf(task)
  const period = periodTag(task, today)
  const span = task.time && task.duration ? spanLabel(task.time, task.duration) : parallel ? clockOf(start) : null
  const meta = [period?.label, span, section].filter(Boolean).join(' · ')

  return (
    <SwipeRow
      className={`tl-row ${task.done ? 'is-done' : ''} ${live !== undefined ? 'is-live' : ''} ${overdue ? 'is-overdue' : ''} ${isDragging ? 'is-dragging' : ''}`}
      flip={task.id}
      nodeRef={setNodeRef}
      disabled={isDragging}
      hold={sizing ? undefined : hold}
      dragId={task.id}
      done={task.done}
      span={spanOf(from, to)}
      onRight={() => actions.toggle(task.id)}
      onLeft={() => actions.remove(task.id)}
    >
      <div className="tl" style={{ '--node': `${nodeHeight(duration)}px`, '--live': live ?? 0, '--imp': scale } as CSSProperties}>
        <span className="tl__time">
          <Clock minutes={start} />
        </span>
        <span className="tl__rail">
          <button
            type="button"
            className="tl__node"
            aria-pressed={task.done}
            aria-label={task.done ? copy.undone(task.title) : copy.complete(task.title)}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={() => actions.toggle(task.id)}
          >
            <IconCheck size={12} strokeWidth={2.6} />
          </button>
        </span>
        <button type="button" className="tl__body" onClick={() => actions.open(task.id)}>
          <span className="tl__title">
            <span className="row__text">{task.title}</span>
          </span>
          {(meta || reminding || placed) && (
            <span className="tl__meta">
              {reminding && <IconBell size={11} strokeWidth={2} />}
              {placed && <IconPlace on={placed} size={11} strokeWidth={2} />}
              {meta}
            </span>
          )}
        </button>
        {sizing && !task.done && (
          <Suspense fallback={<span className="task__slot" aria-hidden="true" />}>
            <ImportanceKnob
              value={task.importance}
              title={task.title}
              onPreview={setSizingTo}
              onChange={(importance) => actions.setImportance(task.id, importance)}
            />
          </Suspense>
        )}
      </div>
    </SwipeRow>
  )
})

interface TimelineRoutineProps {
  routine: Routine
  /** El día en cuyo diario se tacha. */
  day: IsoDate
  start: number
  from?: number
  to?: number
  parallel?: boolean
}

const TimelineRoutine = memo(function TimelineRoutine({ routine, day, start, from, to, parallel = false }: TimelineRoutineProps) {
  const actions = useRowActions()
  const copy = useCopy(COPY)
  const done = routine.done.includes(day)

  return (
    <SwipeRow
      className={`tl-row tl-row--routine ${done ? 'is-done' : ''}`}
      flip={`routine:${routine.id}`}
      span={spanOf(from, to)}
      onRight={() => actions.toggleRoutine(routine.id, day)}
    >
      <div className="tl" style={{ '--node': `${NODE_PX}px` } as CSSProperties}>
        <span className="tl__time">
          <Clock minutes={start} />
        </span>
        <span className="tl__rail">
          <button
            type="button"
            className="tl__node tl__node--routine"
            aria-pressed={done}
            aria-label={done ? copy.unmark(routine.title) : copy.doneRoutine(routine.title)}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={() => actions.toggleRoutine(routine.id, day)}
          >
            {done ? (
              <IconCheck size={12} strokeWidth={2.6} />
            ) : routine.emoji ? (
              <span className="emoji tl__emoji" aria-hidden="true">
                {routine.emoji}
              </span>
            ) : (
              <IconRepeat size={12} strokeWidth={2} />
            )}
          </button>
        </span>
        <button type="button" className="tl__body" onClick={() => actions.openRoutine(routine.id)}>
          <span className="tl__title">
            <span className="row__text">{routine.title}</span>
          </span>
          <span className="tl__meta">
            <IconRepeat size={11} strokeWidth={2} />
            {parallel ? `${clockOf(start)} · ${daysLabel(routine.days)}` : daysLabel(routine.days)}
          </span>
        </button>
      </div>
    </SwipeRow>
  )
})

interface TimelineEventProps {
  event: CalendarEvent
  start: number
  end: number
  live?: number
  /** Ya acabó: se apaga, como lo hecho. */
  over: boolean
  calendar: string
  /** Se puede coger para llevarlo a otro día o a otra hora (su calendario se puede escribir). */
  movable: boolean
  /** Marcado como hecho en Tasks. */
  done: boolean
  onOpen: (event: CalendarEvent) => void
  onToggle: (key: string, done: boolean) => void
  from?: number
  to?: number
}

/**
 * Un evento del calendario: su cápsula lleva el color de su calendario, apagado para que case con el
 * papel; el título va un punto por debajo de las tareas (son lo que hay que hacer) y la hora y el
 * sitio debajo. Se tacha como una tarea (la cápsula o deslizar a la derecha), pero solo en la app: el
 * calendario no se toca. A la izquierda no hay nada (no se borra desde aquí). Tocarlo abre la ficha de
 * Calendario de iOS, y mantenerlo pulsado lo coge para moverlo (si su calendario lo permite).
 */
const TimelineEvent = memo(function TimelineEvent({ event, start, end, live, over, calendar, movable, done, onOpen, onToggle, from, to }: TimelineEventProps) {
  const copy = useCopy(COPY)
  const dragId = eventDragId(event.key)
  const { listeners, setNodeRef, isDragging } = useDraggable({ id: dragId, data: { type: 'event' }, disabled: !movable })
  const { hold } = splitListeners(listeners)
  const span = eventSpan({ start, end })
  const title = event.title || copy.untitled
  const meta = [span, event.location].filter(Boolean).join(' · ')
  const toggle = () => onToggle(event.key, !done)
  return (
    <SwipeRow
      className={`tl-row tl-row--event ${done ? 'is-done' : ''} ${isDragging ? 'is-dragging' : ''}`}
      nodeRef={setNodeRef}
      disabled={isDragging}
      hold={movable ? hold : undefined}
      dragId={movable ? dragId : undefined}
      done={done}
      span={spanOf(from, to)}
      onRight={toggle}
    >
      <div
        className={`tl tl--event cal-tone ${live !== undefined ? 'is-live' : ''} ${over ? 'is-over' : ''}`}
        style={{ '--node': `${nodeHeight(end - start)}px`, '--live': live ?? 0, '--cal': event.color } as CSSProperties}
      >
        <span className="tl__time">
          <Clock minutes={start} />
        </span>
        <span className="tl__rail">
          <button
            type="button"
            className="tl__node tl__node--event"
            aria-pressed={done}
            aria-label={done ? copy.undone(title) : copy.complete(title)}
            onPointerDown={(pointer) => pointer.stopPropagation()}
            onClick={toggle}
          >
            <IconCheck size={12} strokeWidth={2.6} />
          </button>
        </span>
        <button type="button" className="tl__body" aria-label={copy.event(title, span, calendar)} onClick={() => onOpen(event)}>
          <span className="tl__title">
            <span className="row__text">{title}</span>
          </span>
          <span className="tl__meta">{meta}</span>
        </button>
      </div>
    </SwipeRow>
  )
})
