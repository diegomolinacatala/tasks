import { useMemo, useRef, useState } from 'react'
import type { CSSProperties, PointerEvent as ReactPointerEvent, ReactNode } from 'react'
import { spanLabel } from '../../lib/duration'
import { haptic } from '../../lib/platform/feedback'
import { SLOT_STEP, timeAt } from '../../lib/slot'
import type { TapeSpan } from '../../lib/tape'
import { clockOf, freeLabel } from '../../lib/timeline'
import { useCopy } from '../../state/LanguageProvider'
import { IconCheck, IconClose } from '../ui/Icons'
import { HourTape } from '../views/HourTape'
import { Clock } from '../views/Timeline'
import { reducedMotion } from './motion'
import '../views/agenda.css'
import '../views/slot.css'

interface SceneRow {
  id: string
  /** Minutos desde medianoche. */
  at: number
  minutes: number
  title: string
}

const COPY = {
  es: {
    schedule: 'Horario',
    untimed: 'Sin hora',
    rows: [
      { id: 'jorge', at: 570, minutes: 30, title: 'Reunión con Jorge' },
      { id: 'adriana', at: 840, minutes: 60, title: 'Comida con Adriana' },
      { id: 'xoxi', at: 1260, minutes: 0, title: 'Cena en casa de Xoxi' },
    ] satisfies SceneRow[],
    drag: 'Llamar a Ibán',
    hint: 'Suelta aquí para ponerle hora',
    hold: 'Súbela',
    tape: 'Hora de empezar',
    none: 'Sin duración',
    ok: 'Listo',
    cancel: 'Dejarla sin hora',
    label: 'Un horario con tres cosas y, debajo, una tarea sin hora que se arrastra hasta la hora que quieras.',
  },
  en: {
    schedule: 'Schedule',
    untimed: 'No time',
    rows: [
      { id: 'jorge', at: 570, minutes: 30, title: 'Meeting with Jorge' },
      { id: 'adriana', at: 840, minutes: 60, title: 'Lunch with Adriana' },
      { id: 'xoxi', at: 1260, minutes: 0, title: 'Dinner at Xoxi’s' },
    ] satisfies SceneRow[],
    drag: 'Call Ibán',
    hint: 'Drop here to give it a time',
    hold: 'Drag it up',
    tape: 'Start time',
    none: 'No duration',
    ok: 'Done',
    cancel: 'Leave it without a time',
    label: 'A schedule with three things and, below, a task without a time that you drag to the time you want.',
  },
} as const

/** De qué hora a qué hora va el horario de la lámina, de arriba abajo. */
const FROM = 9 * 60
const TO = 23 * 60 + 45
/** Lo que se enseña ya colocado con el movimiento reducido (no se puede arrastrar). */
const STILL_START = 16 * 60 + 45
const DURATIONS = [null, 15, 30, 60] as const
const node = (minutes: number) => `${Math.round(Math.min(64, Math.max(24, minutes * 0.75)))}px`
const snap = (minutes: number) => Math.min(TO, Math.max(FROM, Math.round(minutes / SLOT_STEP) * SLOT_STEP))

interface Placed {
  start: number
  duration: number | null
  /** Ya con «Listo»: la tarea es una más del horario. */
  fixed: boolean
}

interface Slot {
  start: number
  y: number
}

/**
 * Soltar en el horario, con el dedo: tres cosas con hora y, debajo, «Llamar a Ibán» sin ella. Se coge y
 * se sube por el horario: un trazo de coñac dice a qué hora caería, de cuarto en cuarto, y al soltarla
 * sale la tarjeta de verdad con la cinta de horas (`HourTape`) y la duración. «Listo» la deja en su
 * sitio. Hasta que se toca, la fila se hunde sola y el horario enseña dónde soltar.
 */
export function DayScene() {
  const copy = useCopy(COPY)
  const still = useMemo(reducedMotion, [])
  const zone = useRef<HTMLDivElement>(null)
  const row = useRef<HTMLLIElement>(null)
  const gesture = useRef<{ id: number; y: number } | null>(null)
  const lastStart = useRef<number | null>(null)
  const [touched, setTouched] = useState(false)
  const [slot, setSlot] = useState<Slot | null>(null)
  const [placed, setPlaced] = useState<Placed | null>(() => (still ? { start: STILL_START, duration: 30, fixed: true } : null))

  /** A qué hora cae el dedo, por la altura dentro del horario; `null` fuera de él. */
  const slotAt = (clientY: number): Slot | null => {
    const box = zone.current?.getBoundingClientRect()
    if (!box) return null
    const y = clientY - box.top
    if (y < -8 || y > box.height + 8) return null
    const inside = Math.min(box.height, Math.max(0, y))
    return { start: snap(FROM + (inside / box.height) * (TO - FROM)), y: inside }
  }

  /** Devuelve la fila a su sitio, levantada o no. */
  const settle = () => {
    if (row.current) {
      row.current.style.transform = ''
      row.current.classList.remove('is-lifted')
    }
    setSlot(null)
  }

  const onDown = (event: ReactPointerEvent<HTMLLIElement>) => {
    if (placed?.fixed || still || event.button !== 0) return
    try {
      event.currentTarget.setPointerCapture(event.pointerId)
    } catch {
      // El puntero ya no está activo: se sigue sin captura.
    }
    gesture.current = { id: event.pointerId, y: event.clientY }
    lastStart.current = null
    if (!touched) haptic('selection')
    setTouched(true)
    setPlaced(null)
    row.current?.classList.add('is-lifted')
  }

  const onMove = (event: ReactPointerEvent<HTMLLIElement>) => {
    const gest = gesture.current
    if (!gest || event.pointerId !== gest.id) return
    const dy = event.clientY - gest.y
    if (row.current) row.current.style.transform = `translateY(${dy}px)`
    const next = slotAt(event.clientY)
    if (next && next.start !== lastStart.current) {
      lastStart.current = next.start
      haptic('selection')
    }
    setSlot(next)
  }

  const onUp = (event: ReactPointerEvent<HTMLLIElement>) => {
    const gest = gesture.current
    if (!gest || event.pointerId !== gest.id) return
    gesture.current = null
    const where = slotAt(event.clientY)
    settle()
    if (where) {
      haptic('success')
      setPlaced({ start: where.start, duration: null, fixed: false })
    }
  }

  /** El sistema se queda el gesto (una llamada, un scroll): la fila vuelve sin colocarse. */
  const onCancel = (event: ReactPointerEvent<HTMLLIElement>) => {
    if (gesture.current?.id !== event.pointerId) return
    gesture.current = null
    settle()
  }

  const confirm = () => {
    haptic('success')
    setPlaced((current) => (current ? { ...current, fixed: true } : current))
  }

  const cancel = () => {
    haptic('tap')
    setPlaced(null)
  }

  // Lo del horario, con la tarea colocada si ya está fija, en orden; entre cosa y cosa, el tiempo libre.
  const rows: SceneRow[] = useMemo(() => {
    const own: SceneRow[] = [...copy.rows]
    if (placed?.fixed) own.push({ id: 'own', at: placed.start, minutes: placed.duration ?? 0, title: copy.drag })
    return own.sort((a, b) => a.at - b.at)
  }, [copy, placed])
  const busy: TapeSpan[] = useMemo(() => copy.rows.map((item: SceneRow) => ({ start: item.at, end: item.at + Math.max(item.minutes, SLOT_STEP) })), [copy])
  const choosing = placed && !placed.fixed ? placed : null
  // La tarjeta va detrás de lo último que empieza antes de su hora (o delante de todo).
  const cardAfter = choosing ? ([...rows].reverse().find((item) => item.at <= choosing.start)?.id ?? null) : null

  const card = (current: Placed) => (
    <li key="card" className="tl tl--card" style={{ '--node': '24px' } as CSSProperties}>
      <span className="tl__time">
        <Clock minutes={current.start} />
      </span>
      <span className="tl__rail">
        <span className="tl__node tl__node--card" aria-hidden="true" />
      </span>
      <div className="slot" role="group" aria-label={copy.drag}>
        <div className="slot__head">
          <span className="slot__title">{copy.drag}</span>
          <button type="button" className="slot__close" aria-label={copy.cancel} onClick={cancel}>
            <IconClose size={16} />
          </button>
        </div>
        <div className="slot__row">
          <span className="slot__clock">{clockOf(current.start)}</span>
          <button type="button" className="slot__ok" onClick={confirm}>
            <IconCheck size={14} strokeWidth={2.8} />
            {copy.ok}
          </button>
        </div>
        <HourTape
          start={current.start}
          busy={busy}
          now={null}
          duration={current.duration}
          label={copy.tape}
          onChange={(minutes) => setPlaced((state) => (state ? { ...state, start: minutes } : state))}
        />
        <div className="slot__pills" role="radiogroup">
          {DURATIONS.map((minutes) => (
            <button
              key={minutes ?? 'none'}
              type="button"
              role="radio"
              aria-checked={minutes === current.duration}
              className={`slot__pill ${minutes === current.duration ? 'is-on' : ''}`}
              onClick={() => {
                haptic('selection')
                setPlaced((state) => (state ? { ...state, duration: minutes } : state))
              }}
            >
              {minutes === null ? copy.none : minutes >= 60 ? '1 h' : `${minutes} min`}
            </button>
          ))}
        </div>
      </div>
    </li>
  )

  const list: ReactNode[] = []
  if (choosing && cardAfter === null) list.push(card(choosing))
  rows.forEach((item, index) => {
    const previous = rows[index - 1]
    if (previous) {
      const free = item.at - (previous.at + previous.minutes)
      if (free >= SLOT_STEP)
        list.push(
          <li key={`gap-${item.id}`} className="tl tl--gap" aria-hidden="true">
            <span className="tl__time" />
            <span className="tl__rail" />
            <span className="tl__free">{freeLabel(free)}</span>
          </li>,
        )
    }
    list.push(
      <li key={item.id} className={`tl ${item.id === 'own' ? 'scene__placed' : ''}`} style={{ '--node': node(item.minutes) } as CSSProperties}>
        <span className="tl__time">
          <Clock minutes={item.at} />
        </span>
        <span className="tl__rail">
          <span className="tl__node" aria-hidden="true">
            <IconCheck size={12} strokeWidth={2.6} />
          </span>
        </span>
        <span className="tl__body">
          <span className="tl__title">{item.title}</span>
          {item.minutes > 0 && <span className="tl__meta">{spanLabel(timeAt(item.at), item.minutes)}</span>}
        </span>
      </li>,
    )
    if (choosing && cardAfter === item.id) list.push(card(choosing))
  })
  if (!touched && !still && !placed)
    list.push(
      <li key="hint" className="tl tl--hint">
        <span className="tl__time" />
        <span className="tl__rail">
          <span className="tl__slot-dot" />
        </span>
        <span className="tl__hint">{copy.hint}</span>
      </li>,
    )

  return (
    <div className={`scene scene--day ${touched || still ? '' : 'is-hinting'} ${choosing ? 'is-choosing' : ''}`}>
      <p className="sr-only">{copy.label}</p>
      <p className="scene__head" aria-hidden="true">
        {copy.schedule}
      </p>
      <div ref={zone} className="scene__board">
        <ol className="timeline scene__timeline">
          {list}
        </ol>
        {slot && (
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
      {!placed && (
        <>
          <p className="scene__head scene__head--untimed" aria-hidden="true">
            {copy.untimed}
          </p>
          <ul className="column scene__rows">
            <li
              ref={row}
              className={`swipe scene__drag ${slot ? 'is-timed' : ''}`}
              onPointerDown={onDown}
              onPointerMove={onMove}
              onPointerUp={onUp}
              onPointerCancel={onCancel}
            >
              <div className="swipe__surface">
                <div className="row">
                  <span className="row__check" />
                  <span className="row__title">
                    <span className="row__text">{copy.drag}</span>
                  </span>
                  <span className="scene__drag-time">{slot ? clockOf(slot.start) : touched ? '' : copy.hold}</span>
                </div>
              </div>
            </li>
          </ul>
        </>
      )}
    </div>
  )
}
