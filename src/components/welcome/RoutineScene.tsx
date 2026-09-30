import { useMemo, useState } from 'react'
import type { CSSProperties } from 'react'
import { addDays, fullLabel, shortTime, todayIso } from '../../lib/date'
import { isNative } from '../../lib/platform'
import { haptic } from '../../lib/platform/feedback'
import { ALL_DAYS, daysLabel, recentDays, streak, withDay } from '../../lib/routines'
import type { IsoDate, Routine } from '../../types'
import { IconCheck } from '../ui/Icons'
import '../routines/routines.css'

/** En la web no hay widgets: la pantalla de bloqueo solo se enseña donde existe (y al desarrollar). */
const SHOWS_LOCK = isNative || import.meta.env.DEV
const CREATED_DAYS_AGO = 40

/** Una rutina de muestra con los últimos días hechos, menos los que se dejan sin hacer. */
function sample(id: string, title: string, emoji: string, time: string | null, today: IsoDate, days: number, skipped: readonly number[]): Routine {
  return {
    id,
    title,
    emoji,
    days: [...ALL_DAYS],
    time,
    done: Array.from({ length: days }, (_, index) => addDays(today, index - days)).filter((_, index) => !skipped.includes(index)),
    order: 0,
    createdAt: Date.now() - CREATED_DAYS_AGO * 86_400_000,
  }
}

/**
 * Dos rutinas con su emoji, sus puntos de la semana y su racha, que se tachan de un toque. En el
 * iPhone, debajo va el widget de la pantalla de bloqueo con la primera: tacharla en un sitio la
 * tacha en el otro, como pasa de verdad.
 */
export function RoutineScene() {
  const today = useMemo(() => todayIso(), [])
  const [routines, setRoutines] = useState<Routine[]>(() => [
    sample('creatina', 'Tomar creatina', '💊', '10:00', today, 12, [3]),
    sample('leer', 'Leer 20 minutos', '📖', '22:30', today, 9, [1, 5, 8]),
  ])

  const toggle = (id: string) => {
    haptic('success')
    setRoutines((current) =>
      current.map((routine) => (routine.id === id ? { ...routine, done: withDay(routine.done, today, !routine.done.includes(today)) } : routine)),
    )
  }

  const [first] = routines
  const doneToday = routines.filter((routine) => routine.done.includes(today)).length
  const firstDone = Boolean(first?.done.includes(today))

  return (
    <div className="scene scene--routine">
      <ul className="column scene__rows">
        {routines.map((routine) => {
          const done = routine.done.includes(today)
          const run = streak(routine, today)
          const meta = [routine.time ? shortTime(routine.time) : null, daysLabel(routine.days), run >= 2 ? `racha de ${run}` : null]
            .filter(Boolean)
            .join(' · ')
          return (
            <li key={routine.id} className={`routine scene__routine ${done ? 'is-done' : ''}`}>
              <div className="row routine__row">
                <button
                  type="button"
                  className="row__check"
                  aria-pressed={done}
                  aria-label={done ? `Desmarcar «${routine.title}» de hoy` : `Hecha hoy: «${routine.title}»`}
                  onClick={() => toggle(routine.id)}
                >
                  <IconCheck size={13} strokeWidth={2.5} />
                </button>
                <span className="routine__main">
                  <span className="row__title">
                    <span className="emoji routine__emoji" aria-hidden="true">
                      {routine.emoji}
                    </span>
                    <span className="row__text">{routine.title}</span>
                  </span>
                  <span className="routine__meta">{meta}</span>
                </span>
                <span className="routine__week" aria-hidden="true">
                  {recentDays(routine, today).map((mark) => (
                    <i
                      key={mark.date}
                      className={`routine__dot ${mark.done ? 'is-done' : ''} ${mark.due ? '' : 'is-free'} ${mark.date === today ? 'is-today' : ''}`}
                    />
                  ))}
                </span>
              </div>
            </li>
          )
        })}
      </ul>

      {SHOWS_LOCK && first && (
        <div className="lock">
          <p className="lock__date">{fullLabel(today)}</p>
          <div className="lock__widgets">
            <button
              type="button"
              className={`lock__ring ${firstDone ? 'is-done' : ''}`}
              aria-label={`Widget de la pantalla de bloqueo: ${firstDone ? 'desmarcar' : 'tachar'} «${first.title}»`}
              onClick={() => toggle(first.id)}
            >
              <svg className="lock__ring-svg" viewBox="0 0 48 48" aria-hidden="true" style={{ '--ring': doneToday / routines.length } as CSSProperties}>
                <circle className="lock__ring-track" cx="24" cy="24" r="19" />
                <circle className="lock__ring-fill" cx="24" cy="24" r="19" pathLength={1} transform="rotate(-90 24 24)" />
              </svg>
              {firstDone ? <IconCheck size={18} strokeWidth={2.6} /> : <span className="lock__emoji">{first.emoji}</span>}
            </button>
            <button type="button" className="lock__card" tabIndex={-1} aria-hidden="true" onClick={() => toggle(first.id)}>
              <span className="lock__glyph">
                {firstDone ? <IconCheck size={15} strokeWidth={2.6} /> : <span className="lock__emoji">{first.emoji}</span>}
              </span>
              <span className="lock__lines">
                <b className={firstDone ? 'is-done' : ''}>{first.title}</b>
                <small>
                  {firstDone ? 'Hecha' : first.time ? shortTime(first.time) : 'Hoy'} · {doneToday} de {routines.length} hoy
                </small>
              </span>
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
