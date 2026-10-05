import { useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import { addDays, dayNameLong, dayNumber, diffDays, monthLong, startOfWeek } from '../../lib/date'
import { haptic } from '../../lib/platform/feedback'
import { ROUTINE_LOG_DAYS, bestStreak, completionRate, createdOn, dayLetters, isDue, streak } from '../../lib/routines'
import { useCopy } from '../../state/LanguageProvider'
import { useDispatch } from '../../state/StoreProvider'
import type { IsoDate, Routine } from '../../types'
import { IconChevronLeft, IconChevronRight } from '../ui/Icons'

const COPY = {
  es: {
    consistency: 'Constancia',
    streak: 'Racha',
    best: 'Mejor',
    month: '30 días',
    earlier: 'Semanas anteriores',
    later: 'Semanas siguientes',
  },
  en: {
    consistency: 'Consistency',
    streak: 'Streak',
    best: 'Best',
    month: '30 days',
    earlier: 'Earlier weeks',
    later: 'Later weeks',
  },
} as const

const WEEKS = 5
/** Hasta dónde se puede ir hacia atrás: lo que guarda el diario. */
const MAX_PAGE = Math.floor(ROUTINE_LOG_DAYS / (WEEKS * 7))
/** Lo que tiene que moverse el dedo en horizontal para que deje de ser un toque y pinte. */
const PAINT_SLOP = 10
/** Para pintar, el dedo va claramente de lado: un scroll algo torcido no marca nada. */
const PAINT_SLANT = 1.5

interface Stroke {
  pointer: number
  x: number
  y: number
  /** El primer día tocado y lo que se pinta: lo contrario de lo que tenía. */
  first: IsoDate
  value: boolean
  painting: boolean
  /** Días ya pintados en esta pasada: el estado aún no se ha vuelto a pintar. */
  seen: Set<IsoDate>
  /** El último día bajo el dedo: un barrido rápido pinta también los que se ha saltado. */
  last: IsoDate
}

const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1)

/**
 * La constancia de una rutina: racha, la mejor y lo cumplido en el último mes, y las semanas día a día
 * como un cuaderno de asistencia. Cada día pasado se puede marcar o desmarcar tocándolo, y pasando el
 * dedo de lado se marcan (o desmarcan) varios seguidos: así se rehace el historial de una rutina borrada
 * sin querer o de días que se olvidó tachar. Las flechas llevan a semanas anteriores.
 */
export function RoutineLog({ routine, today }: { routine: Routine; today: IsoDate }) {
  const copy = useCopy(COPY)
  const dispatch = useDispatch()
  const [page, setPage] = useState(0)
  const stroke = useRef<Stroke | null>(null)

  const first = addDays(startOfWeek(today), -7 * (WEEKS * (page + 1) - 1))
  const days = Array.from({ length: WEEKS * 7 }, (_, index) => addDays(first, index))
  const last = days[days.length - 1] ?? today
  const done = new Set(routine.done)
  const born = createdOn(routine)
  // Antes de crearla no tocaba (salvo lo que ya aparezca hecho).
  const due = (day: IsoDate) => done.has(day) || (day >= born && isDue(routine, day))
  const year = (day: IsoDate) => (day.slice(0, 4) === today.slice(0, 4) ? '' : ` ${day.slice(0, 4)}`)
  const range =
    monthLong(first) === monthLong(last)
      ? `${capitalize(monthLong(last))}${year(last)}`
      : `${capitalize(monthLong(first))}${year(first)} – ${monthLong(last)}${year(last)}`

  const rate = completionRate(routine, today)
  // El diario guarda un año y poco: lo de antes no se podría guardar.
  const oldest = addDays(today, 1 - ROUTINE_LOG_DAYS)
  const editable = (day: IsoDate) => day <= today && day >= oldest

  const set = (day: IsoDate, value: boolean) => {
    if (!editable(day) || done.has(day) === value) return
    dispatch({ type: 'routine/set', id: routine.id, date: day, done: value })
    haptic(value ? 'success' : 'selection')
  }

  const dayAt = (x: number, y: number): IsoDate | null => {
    const cell = document.elementFromPoint(x, y)?.closest<HTMLElement>('[data-day]')
    return (cell?.dataset.day as IsoDate | undefined) ?? null
  }

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    const day = dayAt(event.clientX, event.clientY)
    if (!day || !editable(day)) return
    stroke.current = {
      pointer: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      first: day,
      value: !done.has(day),
      painting: false,
      seen: new Set([day]),
      last: day,
    }
  }

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const current = stroke.current
    if (!current || current.pointer !== event.pointerId) return
    if (!current.painting) {
      const dx = Math.abs(event.clientX - current.x)
      const dy = Math.abs(event.clientY - current.y)
      if (dy > PAINT_SLOP && dx < dy * PAINT_SLANT) {
        // En vertical (o torcido) es el scroll del panel.
        stroke.current = null
        return
      }
      if (dx < PAINT_SLOP || dx < dy * PAINT_SLANT) return
      current.painting = true
      event.currentTarget.setPointerCapture(event.pointerId)
      set(current.first, current.value)
    }
    const day = dayAt(event.clientX, event.clientY)
    if (!day || day === current.last) return
    // Del último día al de ahora, todos: un barrido rápido no se salta ninguno.
    const [from, to] = day > current.last ? [current.last, day] : [day, current.last]
    for (let step = 0; step <= diffDays(from, to); step++) {
      const each = addDays(from, step)
      if (current.seen.has(each)) continue
      current.seen.add(each)
      set(each, current.value)
    }
    current.last = day
  }

  const onPointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    const current = stroke.current
    stroke.current = null
    if (current && current.pointer === event.pointerId && !current.painting) set(current.first, current.value)
  }

  return (
    <>
      <p className="sheet__title">{copy.consistency}</p>
      <div className="routine-stats">
        <div className="routine-stats__item">
          <span className="routine-stats__value">{streak(routine, today)}</span>
          <span className="routine-stats__label">{copy.streak}</span>
        </div>
        <div className="routine-stats__item">
          <span className="routine-stats__value">{bestStreak(routine, today)}</span>
          <span className="routine-stats__label">{copy.best}</span>
        </div>
        <div className="routine-stats__item">
          <span className="routine-stats__value">{rate === null ? '—' : `${Math.round(rate * 100)}%`}</span>
          <span className="routine-stats__label">{copy.month}</span>
        </div>
      </div>

      <div className="routine-log__nav">
        <button
          type="button"
          className="routine-log__arrow"
          aria-label={copy.earlier}
          disabled={page >= MAX_PAGE}
          onClick={() => setPage((value) => Math.min(MAX_PAGE, value + 1))}
        >
          <IconChevronLeft size={16} />
        </button>
        <span className="routine-log__range">{range}</span>
        <button
          type="button"
          className="routine-log__arrow"
          aria-label={copy.later}
          disabled={page === 0}
          onClick={() => setPage((value) => Math.max(0, value - 1))}
        >
          <IconChevronRight size={16} />
        </button>
      </div>

      <div
        className="routine-history"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => {
          stroke.current = null
        }}
      >
        {dayLetters().map((letter, index) => (
          <span key={index} className="routine-history__head" aria-hidden="true">
            {letter}
          </span>
        ))}
        {days.map((day) => {
          const hit = done.has(day)
          return (
            <button
              key={day}
              type="button"
              data-day={day}
              disabled={!editable(day)}
              aria-pressed={hit}
              aria-label={`${dayNameLong(day)} ${dayNumber(day)}`}
              className={`routine-history__cell ${hit ? 'is-done' : ''} ${due(day) ? '' : 'is-free'} ${
                day > today ? 'is-future' : ''
              } ${day === today ? 'is-today' : ''}`}
              // El toque lo decide el gesto (puede ser el principio de una pasada). Un clic sin dedo
              // (VoiceOver, el teclado) sí marca.
              onClick={(event) => {
                event.preventDefault()
                if (event.detail === 0) set(day, !hit)
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault()
                  set(day, !hit)
                }
              }}
            >
              <span>{dayNumber(day)}</span>
            </button>
          )
        })}
      </div>
    </>
  )
}
