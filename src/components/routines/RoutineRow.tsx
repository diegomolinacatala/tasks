import { memo } from 'react'
import { shortTime } from '../../lib/date'
import type { DayMark } from '../../lib/routines'
import { daysLabel, isDue, recentDays, streak } from '../../lib/routines'
import { useCopy } from '../../state/LanguageProvider'
import type { IsoDate, Routine } from '../../types'
import { SwipeRow } from '../task/SwipeRow'
import { useRowActions } from '../task/rowActions'
import { IconCheck } from '../ui/Icons'
import './routines.css'

const COPY = {
  es: {
    week: (days: number, done: number, due: number) => `Últimos ${days} días: ${done} de ${due}`,
    streak: (run: number) => `racha de ${run}`,
    unmark: (title: string) => `Desmarcar «${title}» de hoy`,
    done: (title: string) => `Hecha hoy: «${title}»`,
  },
  en: {
    week: (days: number, done: number, due: number) => `Last ${days} days: ${done} of ${due}`,
    streak: (run: number) => `${run}-day streak`,
    unmark: (title: string) => `Unmark “${title}” for today`,
    done: (title: string) => `Done today: “${title}”`,
  },
} as const

/** Lo que dicen los puntos, para quien no los ve: "Últimos 7 días: 5 de 6". */
function weekLabel(week: readonly DayMark[], copy: (typeof COPY)[keyof typeof COPY]): string {
  const due = week.filter((mark) => mark.due)
  return copy.week(week.length, due.filter((mark) => mark.done).length, due.length)
}

interface RoutineRowProps {
  routine: Routine
  today: IsoDate
}

/**
 * Una rutina en la Bandeja: el círculo tacha la de hoy, y a la derecha los últimos siete días (lleno,
 * hecho; hueco, no; raya, no tocaba). Deslizar a la derecha también la tacha; a la izquierda, borra.
 */
export const RoutineRow = memo(function RoutineRow({ routine, today }: RoutineRowProps) {
  const actions = useRowActions()
  const copy = useCopy(COPY)
  const due = isDue(routine, today)
  const done = routine.done.includes(today)
  const run = streak(routine, today)
  const week = recentDays(routine, today)
  const meta = [routine.time ? shortTime(routine.time) : null, daysLabel(routine.days), run >= 2 ? copy.streak(run) : null]
    .filter(Boolean)
    .join(' · ')

  return (
    <SwipeRow
      className={`routine ${done ? 'is-done' : ''} ${due ? '' : 'is-off'}`}
      flip={`routine:${routine.id}`}
      onRight={() => actions.toggleRoutine(routine.id, today)}
      onLeft={() => actions.removeRoutine(routine.id)}
    >
      <div className="row routine__row">
        <button
          type="button"
          className="row__check"
          aria-pressed={done}
          aria-label={done ? copy.unmark(routine.title) : copy.done(routine.title)}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={() => actions.toggleRoutine(routine.id, today)}
        >
          <IconCheck size={13} strokeWidth={2.5} />
        </button>
        <button type="button" className="routine__main" onClick={() => actions.openRoutine(routine.id)}>
          <span className="row__title">
            {routine.emoji && (
              <span className="emoji routine__emoji" aria-hidden="true">
                {routine.emoji}
              </span>
            )}
            <span className="row__text">{routine.title}</span>
          </span>
          <span className="routine__meta">{meta}</span>
        </button>
        <span className="routine__week" role="img" aria-label={weekLabel(week, copy)}>
          {week.map((mark) => (
            <i
              key={mark.date}
              className={`routine__dot ${mark.done ? 'is-done' : ''} ${mark.due ? '' : 'is-free'} ${mark.date === today ? 'is-today' : ''}`}
            />
          ))}
        </span>
      </div>
    </SwipeRow>
  )
})
