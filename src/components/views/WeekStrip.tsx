import { memo, useEffect, useLayoutEffect, useRef } from 'react'
import type { CSSProperties, MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent } from 'react'
import { useDroppable } from '@dnd-kit/core'
import { addDays, dayNumber, fullLabel, startOfWeek, weekDays } from '../../lib/date'
import { haptic } from '../../lib/platform/feedback'
import { DAY_LETTERS } from '../../lib/routines'
import type { IsoDate } from '../../types'
import { dayDropId } from '../dnd/ids'
import './agenda.css'

/** Lo que hay cada día: el anillo de avance y el aviso de lo que quedó sin hacer. */
export interface DayLoad {
  total: number
  done: number
}

interface WeekStripProps {
  day: IsoDate
  today: IsoDate
  /** Lo que hay cada día de las tres semanas que se pintan; lo que falta, nada. */
  loads: ReadonlyMap<IsoDate, DayLoad>
  onSelect: (date: IsoDate) => void
}

const EMPTY: DayLoad = { total: 0, done: 0 }

const SWIPE_LOCK_PX = 8
/** Fracción del ancho o velocidad (px/ms) que bastan para pasar de semana. */
const PAGE_RATIO = 0.22
const PAGE_SPEED = 0.35
const PAGE_MS = 300

/**
 * La semana del día elegido, como la tira de Structured: la letra del día, el número y un anillo que
 * se completa con lo hecho. Se desliza a los lados para cambiar de semana (el día de la semana se
 * conserva). Mientras se arrastra una tarea, cada día es un sitio donde soltarla.
 */
export function WeekStrip({ day, today, loads, onSelect }: WeekStripProps) {
  const monday = startOfWeek(day)
  const track = useRef<HTMLDivElement>(null)
  const gesture = useRef<{ x: number; y: number; t: number; mode: 'idle' | 'swipe' | 'scroll'; dx: number } | null>(null)
  const busy = useRef(false)
  // El `click` que llega detrás de deslizar la tira no debe elegir el día que había debajo.
  const swiped = useRef(false)
  const timers = useRef(new Set<number>())

  const later = (run: () => void, ms: number) => {
    const timer = window.setTimeout(() => {
      timers.current.delete(timer)
      run()
    }, ms)
    timers.current.add(timer)
  }

  // Al desmontarse (o esconderse la pestaña) a mitad de un cambio de semana, la pista vuelve al centro.
  useEffect(
    () => () => {
      timers.current.forEach((timer) => window.clearTimeout(timer))
      timers.current.clear()
      busy.current = false
      if (track.current) track.current.style.transform = ''
    },
    [],
  )

  // Tras cambiar de semana la pista vuelve al centro sin animar: la semana nueva ya está ahí.
  useLayoutEffect(() => {
    const node = track.current
    if (!node) return
    node.style.transition = 'none'
    node.style.transform = ''
    busy.current = false
  }, [monday])

  const move = (dx: number, animate: boolean) => {
    const node = track.current
    if (!node) return
    node.style.transition = animate ? `transform ${PAGE_MS}ms var(--ease-sheet)` : 'none'
    node.style.transform = dx ? `translate3d(${dx}px,0,0)` : ''
  }

  const page = (direction: -1 | 1) => {
    const width = track.current?.parentElement?.offsetWidth ?? window.innerWidth
    busy.current = true
    move(-direction * width, true)
    haptic('selection')
    later(() => onSelect(addDays(day, direction * 7)), PAGE_MS)
  }

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (busy.current || (event.pointerType === 'mouse' && event.button !== 0)) return
    gesture.current = { x: event.clientX, y: event.clientY, t: event.timeStamp, mode: 'idle', dx: 0 }
  }

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const current = gesture.current
    if (!current || current.mode === 'scroll') return
    const dx = event.clientX - current.x
    const dy = event.clientY - current.y
    if (current.mode === 'idle') {
      if (Math.abs(dy) > SWIPE_LOCK_PX && Math.abs(dy) > Math.abs(dx)) {
        current.mode = 'scroll'
        return
      }
      if (Math.abs(dx) <= SWIPE_LOCK_PX) return
      current.mode = 'swipe'
      try {
        event.currentTarget.setPointerCapture(event.pointerId)
      } catch {
        // Sin captura el gesto sigue igual mientras el dedo esté encima.
      }
    }
    current.dx = dx
    move(dx, false)
  }

  const onPointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    const current = gesture.current
    gesture.current = null
    if (!current || current.mode !== 'swipe') return
    swiped.current = true
    later(() => (swiped.current = false), 350)
    const width = event.currentTarget.offsetWidth || window.innerWidth
    const speed = current.dx / Math.max(1, event.timeStamp - current.t)
    if (current.dx > width * PAGE_RATIO || speed > PAGE_SPEED) page(-1)
    else if (current.dx < -width * PAGE_RATIO || speed < -PAGE_SPEED) page(1)
    else move(0, true)
  }

  const weeks = [addDays(monday, -7), monday, addDays(monday, 7)]

  return (
    <div
      className="strip"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={() => {
        gesture.current = null
        move(0, true)
      }}
      onClickCapture={(event: ReactMouseEvent) => {
        if (!swiped.current) return
        swiped.current = false
        event.preventDefault()
        event.stopPropagation()
      }}
    >
      <div ref={track} className="strip__track">
        {weeks.map((start) => (
          <div key={start} className="strip__week" aria-hidden={start !== monday}>
            {weekDays(start).map((date, index) => (
              <StripDay
                key={date}
                date={date}
                letter={DAY_LETTERS[index] ?? ''}
                selected={date === day}
                isToday={date === today}
                past={date < today}
                load={loads.get(date) ?? EMPTY}
                droppable={start === monday}
                onSelect={onSelect}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

interface StripDayProps {
  date: IsoDate
  letter: string
  selected: boolean
  isToday: boolean
  past: boolean
  load: DayLoad
  droppable: boolean
  onSelect: (date: IsoDate) => void
}

const RING = 2 * Math.PI * 16

const StripDay = memo(function StripDay({ date, letter, selected, isToday, past, load, droppable, onSelect }: StripDayProps) {
  const { setNodeRef, isOver } = useDroppable({ id: dayDropId(date), data: { type: 'day', date }, disabled: !droppable })
  const pending = load.total - load.done
  const ratio = load.total ? load.done / load.total : 0
  const late = past && pending > 0

  return (
    <button
      ref={setNodeRef}
      type="button"
      tabIndex={droppable ? 0 : -1}
      className={`strip__day ${selected ? 'is-selected' : ''} ${isToday ? 'is-today' : ''} ${late ? 'is-late' : ''} ${
        isOver ? 'is-over' : ''
      }`}
      aria-pressed={selected}
      aria-current={isToday ? 'date' : undefined}
      aria-label={`${isToday ? 'Hoy, ' : ''}${fullLabel(date)}${load.total ? `, ${load.done} de ${load.total} hechas` : ''}`}
      onClick={() => onSelect(date)}
    >
      <span className="strip__letter">{letter}</span>
      <span className="strip__num" style={{ '--ring': ratio } as CSSProperties}>
        <svg viewBox="0 0 36 36" aria-hidden="true">
          {load.total > 0 && <circle className="strip__track-ring" cx="18" cy="18" r="16" />}
          {load.done > 0 && (
            <circle
              className="strip__ring"
              cx="18"
              cy="18"
              r="16"
              strokeDasharray={`${RING * ratio} ${RING}`}
              transform="rotate(-90 18 18)"
            />
          )}
        </svg>
        <span className="strip__digit">{dayNumber(date)}</span>
      </span>
    </button>
  )
})
