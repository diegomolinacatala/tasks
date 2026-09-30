import { useRef, useState } from 'react'
import type { CSSProperties, KeyboardEvent, PointerEvent as ReactPointerEvent } from 'react'
import { haptic } from '../../lib/platform/feedback'
import './slider.css'

interface SliderProps {
  value: number
  min: number
  max: number
  step: number
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

/**
 * Deslizador de la app, como los de Google Maps o Spotify: se coge desde cualquier punto de la pista
 * (no hace falta atinar al botón), el valor va encima del dedo y cada paso vibra.
 */
export function Slider({ value, min, max, step, label, format, onInput, onChange, marks = [] }: SliderProps) {
  const track = useRef<HTMLDivElement>(null)
  const [dragging, setDragging] = useState<number | null>(null)
  const live = useRef(value)
  const current = dragging ?? value
  const ratio = (current - min) / (max - min)

  const valueAt = (clientX: number) => {
    const rect = track.current?.getBoundingClientRect()
    if (!rect || !rect.width) return value
    const raw = min + ((clientX - rect.left) / rect.width) * (max - min)
    return Math.min(max, Math.max(min, Math.round(raw / step) * step))
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

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const delta = event.key === 'ArrowRight' || event.key === 'ArrowUp' ? step : event.key === 'ArrowLeft' || event.key === 'ArrowDown' ? -step : 0
    if (!delta) return
    event.preventDefault()
    const next = Math.min(max, Math.max(min, value + delta))
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
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={current}
        aria-valuetext={format(current)}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={finish}
        onPointerCancel={finish}
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
            <span key={mark} style={{ left: `${((mark - min) / (max - min)) * 100}%` }}>
              {format(mark)}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
