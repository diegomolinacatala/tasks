import { useEffect, useRef, useState } from 'react'
import type { CSSProperties, KeyboardEvent, PointerEvent as ReactPointerEvent } from 'react'
import { shortTime } from '../../lib/date'
import { MAX_DURATION, MIN_DURATION, durationFromEnd, durationLabel, endClock } from '../../lib/duration'
import { haptic } from '../../lib/platform/feedback'
import { durationAt, nextSpan, rulerTicks, spanFor, stepFor } from '../../lib/ruler'
import type { IsoTime } from '../../types'
import { IconClose } from '../ui/Icons'
import { PickerChip } from '../ui/PickerChip'
import './ruler.css'

/** Mantener el dedo este rato al final de la regla la estira. */
const HOLD_MS = 480
/** Desde aquí (en proporción de la pista, también más allá del borde) el dedo está "al final". */
const END_ZONE = 0.97

interface DurationPickerProps {
  /** Solo se pinta con hora: sin ella no hay desde cuándo contar ni cuándo preguntar. */
  time: IsoTime
  duration: number | null
  /** Hecha ya no se pregunta nada: la línea de abajo sobra. */
  done?: boolean
  onChange: (minutes: number | null) => void
}

interface Gesture {
  value: number | null
  ratio: number
  timer: number | undefined
}

/**
 * Cuánto dura, en una regla de papelería: se arrastra (o se toca) y la tinta va desde la hora de
 * empezar hasta la de acabar, de 5 en 5 minutos en las dos primeras horas. Para más, se mantiene el
 * dedo al final: el borde se llena de oro y la regla se estira (4 h, 8 h, medio día), con un toque de
 * vibración. Al soltar vuelve al tramo que le queda holgado, para ganar precisión. A la izquierda del
 * todo, o con la ×, sin duración; la hora de acabar abre la rueda para ponerla exacta.
 */
export function DurationPicker({ time, duration, done = false, onChange }: DurationPickerProps) {
  const track = useRef<HTMLDivElement>(null)
  const [span, setSpan] = useState(() => spanFor(duration))
  const spanRef = useRef(span)
  // De cuánto venía la regla al estirarse o encogerse: las marcas se animan desde allí.
  const [from, setFrom] = useState(1)
  // Lo que marca el dedo mientras arrastra; `undefined` si no se arrastra.
  const [live, setLive] = useState<number | null | undefined>(undefined)
  const [holding, setHolding] = useState(false)
  // Cada vez que se empieza a mantener, el aro de oro vuelve a llenarse desde cero.
  const [holdRound, setHoldRound] = useState(0)
  const gesture = useRef<Gesture | null>(null)

  const resize = (next: number) => {
    const previous = spanRef.current
    if (previous === next) return
    spanRef.current = next
    setFrom(next / previous)
    setSpan(next)
  }

  // Si la duración cambia desde fuera (la hora de acabar, otra tarea), la regla se ajusta a ella.
  useEffect(() => {
    if (!gesture.current) resize(spanFor(duration))
  }, [duration]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => () => window.clearTimeout(gesture.current?.timer), [])

  const ratioAt = (clientX: number) => {
    const rect = track.current?.getBoundingClientRect()
    return rect?.width ? (clientX - rect.left) / rect.width : 0
  }

  const show = (state: Gesture, next: number | null, feel: boolean) => {
    if (next === state.value) return
    state.value = next
    if (feel) haptic('selection')
    setLive(next)
  }

  const stopHold = () => {
    const state = gesture.current
    if (state?.timer !== undefined) window.clearTimeout(state.timer)
    if (state) state.timer = undefined
    setHolding(false)
  }

  const startHold = () => {
    const state = gesture.current
    if (!state || state.timer !== undefined || spanRef.current >= MAX_DURATION) return
    setHolding(true)
    setHoldRound((round) => round + 1)
    state.timer = window.setTimeout(() => {
      state.timer = undefined
      setHolding(false)
      if (gesture.current !== state) return
      resize(nextSpan(spanRef.current))
      haptic('success')
      // El dedo sigue al final: ahora marca todo lo que abarca la regla estirada.
      show(state, durationAt(1, spanRef.current), false)
      if (state.ratio >= END_ZONE) startHold()
    }, HOLD_MS)
  }

  const follow = (clientX: number) => {
    const state = gesture.current
    if (!state) return
    state.ratio = ratioAt(clientX)
    show(state, durationAt(state.ratio, spanRef.current), true)
    if (state.ratio >= END_ZONE) startHold()
    else stopHold()
  }

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return
    event.currentTarget.setPointerCapture(event.pointerId)
    gesture.current = { value: duration, ratio: 0, timer: undefined }
    setLive(duration)
    follow(event.clientX)
  }

  const finish = () => {
    const state = gesture.current
    if (!state) return
    stopHold()
    gesture.current = null
    setLive(undefined)
    resize(spanFor(state.value))
    if (state.value !== duration) onChange(state.value)
  }

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const direction = event.key === 'ArrowRight' || event.key === 'ArrowUp' ? 1 : event.key === 'ArrowLeft' || event.key === 'ArrowDown' ? -1 : 0
    if (!direction) return
    event.preventDefault()
    const raw = (duration ?? 0) + direction * stepFor(spanRef.current)
    const next = raw < MIN_DURATION ? null : Math.min(raw, MAX_DURATION)
    if (next !== duration) onChange(next)
  }

  const setEnd = (value: string) => {
    // Acabar a la hora de empezar sería un toque en falso: daría la vuelta al reloj.
    if (value && value !== time) onChange(durationFromEnd(time, value))
  }

  const current = live === undefined ? duration : live
  const ratio = current === null ? 0 : Math.min(1, current / span)
  const end = current === null ? null : endClock(time, current)
  const ticks = rulerTicks(span)
  const atEnd = ratio >= END_ZONE && span < MAX_DURATION
  const label = current === null ? 'Sin duración' : durationLabel(current)

  return (
    <>
      <p className="sheet__title">Duración</p>
      <div
        className={`ruler ${live !== undefined ? 'is-dragging' : ''} ${holding ? 'is-holding' : ''} ${current === null ? 'is-empty' : ''} ${
          atEnd ? 'can-stretch' : ''
        }`}
        style={{ '--ratio': ratio, '--hold-ms': `${HOLD_MS}ms` } as CSSProperties}
      >
        <div className="ruler__head">
          <span className="ruler__value">{label}</span>
          <span className="ruler__span">
            {end && <span className="ruler__start">{shortTime(time)} →</span>}
            <PickerChip type="time" className="ruler__end" value={end ?? ''} onCommit={setEnd}>
              {end ? shortTime(end) : 'Hasta…'}
            </PickerChip>
          </span>
          {duration !== null && (
            <button type="button" className="ruler__clear" aria-label="Quitar la duración" onClick={() => onChange(null)}>
              <IconClose size={13} />
            </button>
          )}
        </div>

        <div
          ref={track}
          className="ruler__track"
          role="slider"
          tabIndex={0}
          aria-label="Duración"
          aria-valuemin={0}
          aria-valuemax={span}
          aria-valuenow={current ?? 0}
          aria-valuetext={label}
          onPointerDown={onPointerDown}
          onPointerMove={(event) => follow(event.clientX)}
          onPointerUp={finish}
          onPointerCancel={finish}
          onKeyDown={onKeyDown}
        >
          <span className="ruler__rail" />
          <span key={span} className="ruler__ticks" style={{ '--from': from } as CSSProperties} aria-hidden="true">
            {ticks.map((tick) => (
              <i key={tick.minutes} className={tick.major ? 'is-major' : ''} style={{ left: `${(tick.minutes / span) * 100}%` }} />
            ))}
          </span>
          <span key={holdRound} className="ruler__more" aria-hidden="true" />
          <span className="ruler__ink" />
          <span className="ruler__pin">
            <span className="ruler__thumb" />
          </span>
        </div>

        <div key={span} className="ruler__labels" aria-hidden="true">
          {ticks.map(
            (tick) =>
              tick.label && (
                <span key={tick.minutes} style={{ left: `${(tick.minutes / span) * 100}%` }}>
                  {tick.label}
                </span>
              ),
          )}
        </div>
      </div>
      {end && !done && <p className="sheet__note">A las {shortTime(end)} te pregunto si has acabado.</p>}
    </>
  )
}
