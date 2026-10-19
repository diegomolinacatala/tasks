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
import { SLOT_END } from '../../lib/slot'
import type { TimelineRow } from '../../lib/timeline'
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

/** El hueco en que caería lo que se arrastra: delante de qué (`SLOT_END`, detrás de todo) y a qué hora. */
export interface TimelineSlot {
  before: string
  start: number
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
  /** Se está arrastrando algo por la Agenda: el horario acepta soltarlo entre dos cosas. */
  dragging?: boolean
  /** Dónde caería ahora mismo lo que se arrastra; `null` si no está encima. */
  slot?: TimelineSlot | null
  /** Ya soltado: la tarjeta de hora y duración, en su hueco. */
  card?: { before: string; node: ReactNode } | null
  /** Qué eventos del calendario se pueden coger (los de un calendario que se puede escribir). */
  movable?: (event: CalendarEvent) => boolean
}

/**
 * Lo que tiene hora, a lo largo de una línea: una cápsula por tarea, tan alta como lo que dura, que
 * se rellena al completarla; entre medias, el tiempo libre; y hoy, una marca en el momento actual.
 * Los eventos del calendario del iPhone van en la misma línea, con el color de su calendario: no se
 * tachan (no son tareas) y tocarlos abre su ficha de Calendario; mantenerlos pulsados los coge para
 * llevarlos a otro día o a otra hora. Soltar algo entre dos cosas (`slot`) le pone hora: la tarjeta
 * (`card`) aparece en ese hueco.
 */
export function Timeline({ rows, day, sections, now, past, routineDay = day, dragging = false, slot = null, card = null, movable }: TimelineProps) {
  const copy = useCopy(COPY)
  const calendar = useCalendar()
  // El hueco (`slot`) ya dice que se está encima: no hace falta más señal.
  const { setNodeRef } = useDroppable({ id: timelineDropId(day), data: { type: 'timeline' } })

  // El hueco solo mientras se arrastra: al soltar, su sitio lo ocupa la tarjeta.
  const slotRow = slot && dragging ? (
    <li key="slot" className="tl tl--slot" aria-hidden="true">
      <span className="tl__time">
        <Clock minutes={slot.start} />
      </span>
      <span className="tl__rail">
        <span className="tl__slot-dot" />
      </span>
      <span className="tl__slot-line" />
    </li>
  ) : null
  // La tarjeta ya es una fila (`SlotCard` pinta su `li`): solo hay que colocarla.
  const cardRow = card ? <Fragment key="card">{card.node}</Fragment> : null

  const list: ReactNode[] = []
  let cardPlaced = false
  for (const row of rows) {
    if (row.kind !== 'gap' && row.kind !== 'now') {
      if (slotRow && slot?.before === row.id) list.push(slotRow)
      if (card?.before === row.id) {
        list.push(cardRow)
        cardPlaced = true
      }
    }
    list.push(renderRow(row))
  }
  if (slotRow && slot?.before === SLOT_END) list.push(slotRow)
  // Detrás de todo; también si lo que tenía delante ya no está (se tachó o se borró con la tarjeta abierta).
  if (cardRow && !cardPlaced) list.push(cardRow)
  // Un horario vacío mientras se arrastra: dónde soltar.
  if (!rows.length && dragging && !slot && !card) {
    list.push(
      <li key="hint" className="tl tl--hint" aria-hidden="true">
        <span className="tl__time" />
        <span className="tl__rail">
          <span className="tl__slot-dot" />
        </span>
        <span className="tl__hint">{copy.dropHint}</span>
      </li>,
    )
  }

  function renderRow(row: TimelineRow): ReactNode {
    if (row.kind === 'gap')
      return (
        <li key={row.id} className="tl tl--gap" aria-hidden="true">
          <span className="tl__time" />
          <span className="tl__rail" />
          <span className="tl__free">{freeLabel(row.minutes)}</span>
        </li>
      )
    if (row.kind === 'now')
      return (
        <li key="now" className="tl tl--now" aria-label={copy.now(clockOf(row.minutes))}>
          <span className="tl__time">
            <Clock minutes={row.minutes} />
          </span>
          <span className="tl__rail">
            <i className="tl__now-dot" />
          </span>
          <span className="tl__now-line" />
        </li>
      )
    if (row.kind === 'routine') return <TimelineRoutine key={row.id} routine={row.routine} day={routineDay} start={row.start} />
    if (row.kind === 'event')
      return (
        <TimelineEvent
          key={row.id}
          event={row.event}
          start={row.start}
          end={row.end}
          live={row.live}
          over={past || (now !== null && row.end <= now && row.end > row.start)}
          calendar={calendar.calendars.find((item) => item.id === row.event.calendarId)?.title ?? ''}
          movable={movable?.(row.event) ?? false}
          onOpen={calendar.open}
        />
      )
    const section = row.task.sectionId ? sections.find((item) => item.id === row.task.sectionId) : undefined
    return <TimelineTask key={row.id} task={row.task} start={row.start} live={row.live} section={section?.name} overdue={past && !row.task.done} />
  }

  return (
    <ol ref={setNodeRef} className="timeline" aria-label={copy.schedule}>
      {list}
    </ol>
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
}

const TimelineTask = memo(function TimelineTask({ task, start, live, section, overdue }: TimelineTaskProps) {
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
  const meta = [period?.label, task.time && task.duration ? spanLabel(task.time, task.duration) : null, section].filter(Boolean).join(' · ')

  return (
    <SwipeRow
      className={`tl-row ${task.done ? 'is-done' : ''} ${live !== undefined ? 'is-live' : ''} ${overdue ? 'is-overdue' : ''} ${isDragging ? 'is-dragging' : ''}`}
      flip={task.id}
      nodeRef={setNodeRef}
      disabled={isDragging}
      hold={sizing ? undefined : hold}
      dragId={task.id}
      done={task.done}
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
}

const TimelineRoutine = memo(function TimelineRoutine({ routine, day, start }: TimelineRoutineProps) {
  const actions = useRowActions()
  const copy = useCopy(COPY)
  const done = routine.done.includes(day)

  return (
    <SwipeRow className={`tl-row tl-row--routine ${done ? 'is-done' : ''}`} flip={`routine:${routine.id}`} onRight={() => actions.toggleRoutine(routine.id, day)}>
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
            {daysLabel(routine.days)}
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
  onOpen: (event: CalendarEvent) => void
}

/**
 * Un evento del calendario: su cápsula lleva el color de su calendario, apagado para que case con el
 * papel; el título va un punto por debajo de las tareas (son lo que hay que hacer) y la hora y el
 * sitio debajo. No se desliza ni se tacha: tocarlo abre la ficha de Calendario de iOS, y mantenerlo
 * pulsado lo coge para moverlo (si su calendario lo permite).
 */
const TimelineEvent = memo(function TimelineEvent({ event, start, end, live, over, calendar, movable, onOpen }: TimelineEventProps) {
  const copy = useCopy(COPY)
  const dragId = eventDragId(event.key)
  const { listeners, setNodeRef, isDragging } = useDraggable({ id: dragId, data: { type: 'event' }, disabled: !movable })
  const { hold } = splitListeners(listeners)
  const span = eventSpan({ start, end })
  const title = event.title || copy.untitled
  const meta = [span, event.location].filter(Boolean).join(' · ')
  return (
    <li
      ref={setNodeRef}
      data-drag-id={movable ? dragId : undefined}
      className={`tl tl--event cal-tone ${live !== undefined ? 'is-live' : ''} ${over ? 'is-over' : ''} ${isDragging ? 'is-dragging' : ''}`}
      style={{ '--node': `${nodeHeight(end - start)}px`, '--live': live ?? 0, '--cal': event.color } as CSSProperties}
      {...(movable ? hold : {})}
      onContextMenu={movable ? (contextMenu) => contextMenu.preventDefault() : undefined}
    >
      <span className="tl__time">
        <Clock minutes={start} />
      </span>
      <span className="tl__rail">
        <span className="tl__node tl__node--event" aria-hidden="true" />
      </span>
      <button type="button" className="tl__body" aria-label={copy.event(title, span, calendar)} onClick={() => onOpen(event)}>
        <span className="tl__title">{title}</span>
        <span className="tl__meta">{meta}</span>
      </button>
    </li>
  )
})
