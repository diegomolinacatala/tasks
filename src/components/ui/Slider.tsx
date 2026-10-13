import { useRef, useState } from 'react'
import type { CSSProperties, KeyboardEvent, PointerEvent as ReactPointerEvent } from 'react'
import { haptic } from '../../lib/platform/feedback'
import './slider.css'

interface SliderProps {
  value: number
  /** Los valores posibles, de menor a mayor, repartidos por igual a lo largo de la pista. */
  stops: readonly number[]
  label: string
  /** Texto del valor: `300 m`. */
  format: (value: number) => string
  /** Mientras se arrastra (para ver el cambio en vivo). */
  onInput?: (value: number) => void
  /** Al soltar. */
  onChange: (value: number) => void
  /** Marcas bajo la pista. */
  marks?: readonly number[]
}

/** El valor posible más cercano (un valor guardado antes puede no estar entre ellos). */
function stopIndex(stops: readonly number[], value: number): number {
  let best = 0
  stops.forEach((stop, index) => {
    if (Math.abs(stop - value) < Math.abs((stops[best] ?? stop) - value)) best = index
  })
  return best
}

/**
 * Deslizador de la app, como los de Google Maps o Spotify: se coge desde cualquier punto de la pista
 * (no hace falta atinar al botón), el valor va encima del dedo y cada paso vibra. Como la regla de la
 * duración, el dedo es suyo desde que se apoya (`touch-action: none`): aunque se desvíe en vertical,
 * el deslizador lo sigue y el panel no se mueve.
 */
export function Slider({ value, stops, label, format, onInput, onChange, marks = [] }: SliderProps) {
  const track = useRef<HTMLDivElement>(null)
  const [dragging, setDragging] = useState<number | null>(null)
  const live = useRef(value)
  const current = dragging ?? value
  const last = Math.max(1, stops.length - 1)
  const ratio = stopIndex(stops, current) / last

  const valueAt = (clientX: number) => {
    const rect = track.current?.getBoundingClientRect()
    if (!rect || !rect.width) return value
    const fraction = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width))
    return stops[Math.round(fraction * last)] ?? value
  }

  const preview = (next: number) => {
    if (next === live.current) return
    live.current = next
    haptic('selection')
    setDragging(next)
    onInput?.(next)
  }

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return
    event.currentTarget.setPointerCapture(event.pointerId)
    live.current = value
    setDragging(value)
    preview(valueAt(event.clientX))
  }

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (dragging === null) return
    preview(valueAt(event.clientX))
  }

  const finish = () => {
    if (dragging === null) return
    setDragging(null)
    if (live.current !== value) onChange(live.current)
  }

  /** El sistema se quedó el dedo: lo previsualizado no se guarda y el círculo del mapa vuelve a su valor. */
  const cancel = () => {
    if (dragging === null) return
    setDragging(null)
    live.current = value
    onInput?.(value)
  }

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const delta = event.key === 'ArrowRight' || event.key === 'ArrowUp' ? 1 : event.key === 'ArrowLeft' || event.key === 'ArrowDown' ? -1 : 0
    if (!delta) return
    event.preventDefault()
    const next = stops[Math.min(last, Math.max(0, stopIndex(stops, value) + delta))] ?? value
    if (next !== value) onChange(next)
  }

  return (
    <div className={`slider ${dragging !== null ? 'is-dragging' : ''}`} style={{ '--ratio': ratio } as CSSProperties}>
      <div
        ref={track}
        className="slider__track"
        role="slider"
        tabIndex={0}
        aria-label={label}
        aria-valuemin={stops[0]}
        aria-valuemax={stops[stops.length - 1]}
        aria-valuenow={current}
        aria-valuetext={format(current)}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={finish}
        onPointerCancel={cancel}
        onKeyDown={onKeyDown}
      >
        <span className="slider__rail" />
        <span className="slider__fill" />
        <span className="slider__thumb">
          <span className="slider__bubble">{format(current)}</span>
        </span>
      </div>
      {marks.length > 0 && (
        <div className="slider__marks" aria-hidden="true">
          {marks.map((mark) => (
            <span key={mark} style={{ left: `${(stopIndex(stops, mark) / last) * 100}%` }}>
              {format(mark)}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
