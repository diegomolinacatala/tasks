import { useLayoutEffect, useMemo, useRef } from 'react'
import type { CSSProperties, KeyboardEvent, PointerEvent as ReactPointerEvent } from 'react'
import { haptic } from '../../lib/platform/feedback'
import { SLOT_STEP, steppedStart } from '../../lib/slot'
import type { TapeSpan } from '../../lib/tape'
import { TAPE_LAST, TAPE_WIDTH, minutesAtOffset, tapeOffset, tapeTicks } from '../../lib/tape'
import { clockOf } from '../../lib/timeline'
import { useLanguage } from '../../state/LanguageProvider'
import './tape.css'

interface HourTapeProps {
  /** La hora bajo la aguja, en minutos desde medianoche. */
  start: number
  /** Lo ocupado ese día, sombreado (sin lo que se está colocando). */
  busy: readonly TapeSpan[]
  /** Minutos de ahora si el día es hoy: una marca de coñac. */
  now: number | null
  /** Lo que dura lo que se coloca: una banda de tinta desde la aguja. `null`, nada. */
  duration: number | null
  label: string
  onChange: (minutes: number) => void
}

/** Moverse menos que esto es tocar, no arrastrar: elige la hora tocada. */
const TAP_PX = 5
/** Lo que tarda la cinta en asentarse en el cuarto de hora al soltar. */
const SETTLE_MS = 120

interface Gesture {
  x: number
  /** Dónde estaba la cinta (px de la hora bajo la aguja) al apoyar el dedo. */
  from: number
  /** La última hora que se despachó: para vibrar solo al cambiar de hora en punto. */
  last: number
  moved: boolean
}

/**
 * La cinta de horas: el día entero en una tira que se arrastra bajo una aguja fija, como la cinta de
 * una cámara. El dedo mueve la tira (no pasa por React: el `transform` se escribe en cada movimiento)
 * y la hora que queda bajo la aguja es la elegida, de cuarto en cuarto; vibra al cruzar una hora en
 * punto. Tocar un punto lleva esa hora a la aguja. Lo ocupado va sombreado, "ahora" en coñac y lo que
 * dura, en tinta desde la aguja. Coge el dedo desde que se apoya (`touch-action: none`), como la regla.
 */
export function HourTape({ start, busy, now, duration, label, onChange }: HourTapeProps) {
  const window = useRef<HTMLDivElement>(null)
  const strip = useRef<HTMLDivElement>(null)
  const gesture = useRef<Gesture | null>(null)
  // Lo último que se pintó: el efecto de abajo no pisa el asentado del gesto si la hora ya está puesta.
  const painted = useRef<number | null>(null)
  const language = useLanguage()
  // Las cifras cambian con el idioma; las marcas no dependen de la hora: se pintan una vez.
  const ticks = useMemo(() => tapeTicks(), [language])
  const px = (minutes: number) => `${tapeOffset(minutes)}px`
  const width = (span: TapeSpan) => `${tapeOffset(span.end) - tapeOffset(span.start)}px`
  const marks = useMemo(
    () => (
      <>
        {ticks.map((tick) => (
          <i key={tick.minutes} className={`tape__tick ${tick.major ? 'is-major' : ''}`} style={{ left: px(tick.minutes) }} />
        ))}
        {ticks.map((tick) =>
          tick.label ? (
            <span key={`h${tick.minutes}`} className="tape__hour" style={{ left: px(tick.minutes) }}>
              {tick.label}
            </span>
          ) : null,
        )}
      </>
    ),
    [ticks], // eslint-disable-line react-hooks/exhaustive-deps
  )
  const shade = useMemo(
    () => busy.map((span) => <i key={span.start} className="tape__busy" style={{ left: px(span.start), width: width(span) }} />),
    [busy], // eslint-disable-line react-hooks/exhaustive-deps
  )

  const half = () => (window.current?.clientWidth ?? 0) / 2

  /** Deja la cinta con `offset` px (de la hora que toque) bajo la aguja; `settle` lo anima un poco. */
  const paint = (offset: number, settle: boolean) => {
    const node = strip.current
    if (!node) return
    painted.current = offset
    node.style.transition = settle ? `transform ${SETTLE_MS}ms var(--ease-out)` : 'none'
    node.style.transform = `translate3d(${half() - offset}px, 0, 0)`
  }

  // Fuera del gesto, la cinta sigue a la hora (la rueda, el teclado, otra tarjeta). Si la hora ya es la
  // pintada (acaba de asentarse tras el gesto), no se toca: pisaría su animación.
  useLayoutEffect(() => {
    if (gesture.current || painted.current === tapeOffset(start)) return
    paint(tapeOffset(start), false)
  }) // eslint-disable-line react-hooks/exhaustive-deps

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return
    event.currentTarget.setPointerCapture(event.pointerId)
    gesture.current = { x: event.clientX, from: tapeOffset(start), last: start, moved: false }
    paint(tapeOffset(start), false)
  }

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const current = gesture.current
    if (!current) return
    const dx = event.clientX - current.x
    if (!current.moved && Math.abs(dx) < TAP_PX) return
    current.moved = true
    // El dedo arrastra la tira: hacia la izquierda pasan las horas siguientes bajo la aguja.
    const offset = Math.min(Math.max(current.from - dx, 0), tapeOffset(TAPE_LAST))
    paint(offset, false)
    const minutes = minutesAtOffset(offset)
    if (minutes === current.last) return
    // Vibra en las horas en punto, no en cada cuarto: seis horas de recorrido no pueden zumbar.
    if (Math.floor(minutes / 60) !== Math.floor(current.last / 60)) haptic('selection')
    current.last = minutes
    onChange(minutes)
  }

  const onPointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    const current = gesture.current
    gesture.current = null
    if (!current) return
    if (!current.moved) {
      // Tocar: la hora tocada va a la aguja.
      const rect = window.current?.getBoundingClientRect()
      const minutes = rect ? minutesAtOffset(current.from + (event.clientX - (rect.left + rect.width / 2))) : start
      if (minutes !== start) {
        haptic('selection')
        onChange(minutes)
      }
      paint(tapeOffset(minutes), true)
      return
    }
    paint(tapeOffset(current.last), true)
  }

  const onPointerCancel = () => {
    const current = gesture.current
    gesture.current = null
    paint(tapeOffset(current?.last ?? start), true)
  }

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const delta = event.key === 'ArrowRight' || event.key === 'ArrowUp' ? 1 : event.key === 'ArrowLeft' || event.key === 'ArrowDown' ? -1 : 0
    if (!delta) return
    event.preventDefault()
    const next = steppedStart(start, delta)
    if (next !== start) {
      haptic('selection')
      onChange(next)
    }
  }

  return (
    <div
      className="tape"
      role="slider"
      tabIndex={0}
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={TAPE_LAST}
      aria-valuenow={start}
      aria-valuetext={clockOf(start)}
      onKeyDown={onKeyDown}
    >
      <div
        ref={window}
        className="tape__window"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
      >
        <div ref={strip} className="tape__strip" style={{ width: `${TAPE_WIDTH}px` } as CSSProperties}>
          {shade}
          {duration !== null && duration > 0 && (
            <i className="tape__ink" style={{ left: px(start), width: width({ start, end: Math.min(start + duration, TAPE_LAST + SLOT_STEP) }) }} />
          )}
          {marks}
          {now !== null && <i className="tape__now" style={{ left: px(now) }} />}
        </div>
        <i className="tape__needle" aria-hidden="true" />
      </div>
    </div>
  )
}
