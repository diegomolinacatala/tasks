import { Suspense, lazy, memo, useState } from 'react'
import type { CSSProperties } from 'react'
import { spanLabel } from '../../lib/duration'
import { importanceScale } from '../../lib/importance'
import { nextReminderAt } from '../../lib/reminders'
import { daysLabel } from '../../lib/routines'
import type { TimelineRow } from '../../lib/timeline'
import { clockOf, freeLabel } from '../../lib/timeline'
import { useCopy } from '../../state/LanguageProvider'
import type { IsoDate, Routine, Section, Task } from '../../types'
import { useSizing } from '../importance/sizing'
import { SwipeRow } from '../task/SwipeRow'
import { useRowActions } from '../task/rowActions'
import { IconBell, IconCheck, IconPin, IconRepeat } from '../ui/Icons'
import './agenda.css'

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
  },
  en: {
    schedule: 'Schedule',
    now: (clock: string) => `Now, ${clock}`,
    undone: (title: string) => `Mark “${title}” as pending`,
    complete: (title: string) => `Complete “${title}”`,
    unmark: (title: string) => `Unmark “${title}”`,
    doneRoutine: (title: string) => `Done: “${title}”`,
  },
} as const

/** La hora de la columna; en inglés, AM y PM debajo, en pequeño, para que quepa en su sitio. */
function Clock({ minutes }: { minutes: number }) {
  const [time, meridiem] = clockOf(minutes).split(' ')
  return (
    <>
      {time}
      {meridiem && <small className="tl__meridiem">{meridiem}</small>}
    </>
  )
}

const nodeHeight = (minutes: number) => Math.round(Math.min(MAX_NODE_PX, Math.max(NODE_PX, minutes * PX_PER_MINUTE)))

interface TimelineProps {
  rows: TimelineRow[]
  day: IsoDate
  sections: readonly Section[]
}

/**
 * Lo que tiene hora, a lo largo de una línea: una cápsula por tarea, tan alta como lo que dura, que
 * se rellena al completarla; entre medias, el tiempo libre; y hoy, una marca en el momento actual.
 */
export function Timeline({ rows, day, sections }: TimelineProps) {
  const copy = useCopy(COPY)
  return (
    <ol className="timeline" aria-label={copy.schedule}>
      {rows.map((row) => {
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
        if (row.kind === 'routine') return <TimelineRoutine key={row.id} routine={row.routine} day={day} start={row.start} />
        const section = row.task.sectionId ? sections.find((item) => item.id === row.task.sectionId) : undefined
        return <TimelineTask key={row.id} task={row.task} start={row.start} live={row.live} section={section?.name} />
      })}
    </ol>
  )
}

interface TimelineTaskProps {
  task: Task
  start: number
  /** De 0 a 1 si está en curso. */
  live?: number
  section?: string
}

const TimelineTask = memo(function TimelineTask({ task, start, live, section }: TimelineTaskProps) {
  const actions = useRowActions()
  const sizing = useSizing()
  const copy = useCopy(COPY)
  const [sizingTo, setSizingTo] = useState<number | null>(null)
  const duration = task.duration ?? 0
  const scale = task.done ? 0 : importanceScale(sizingTo ?? task.importance)
  const reminding = nextReminderAt(task, Date.now()) !== null
  const placed = !task.done && task.reminders.some((reminder) => reminder.kind === 'place')
  const meta = [task.time && task.duration ? spanLabel(task.time, task.duration) : null, section].filter(Boolean).join(' · ')

  return (
    <SwipeRow
      className={`tl-row ${task.done ? 'is-done' : ''} ${live !== undefined ? 'is-live' : ''}`}
      flip={task.id}
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
              {placed && <IconPin size={11} strokeWidth={2} />}
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
