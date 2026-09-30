import { memo } from 'react'
import { shortTime } from '../../lib/date'
import type { DayMark } from '../../lib/routines'
import { daysLabel, isDue, recentDays, streak } from '../../lib/routines'
import type { IsoDate, Routine } from '../../types'
import { SwipeRow } from '../task/SwipeRow'
import { useRowActions } from '../task/rowActions'
import { IconCheck } from '../ui/Icons'
import './routines.css'

/** Lo que dicen los puntos, para quien no los ve: "Últimos 7 días: 5 de 6". */
function weekLabel(week: readonly DayMark[]): string {
  const due = week.filter((mark) => mark.due)
  return `Últimos ${week.length} días: ${due.filter((mark) => mark.done).length} de ${due.length}`
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
  const due = isDue(routine, today)
  const done = routine.done.includes(today)
  const run = streak(routine, today)
  const week = recentDays(routine, today)
  const meta = [routine.time ? shortTime(routine.time) : null, daysLabel(routine.days), run >= 2 ? `racha de ${run}` : null]
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
          aria-label={done ? `Desmarcar «${routine.title}» de hoy` : `Hecha hoy: «${routine.title}»`}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={() => actions.toggleRoutine(routine.id, today)}
        >
          <IconCheck size={13} strokeWidth={2.5} />
        </button>
        <button type="button" className="routine__main" onClick={() => actions.openRoutine(routine.id)}>
          <span className="row__title">
            <span className="row__text">{routine.title}</span>
          </span>
          <span className="routine__meta">{meta}</span>
        </button>
        <span className="routine__week" role="img" aria-label={weekLabel(week)}>
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
