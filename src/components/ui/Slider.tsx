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
 * (no hace falta atinar al botón), el valor va encima del dedo y cada paso vibra. Apoyar el dedo no
 * cambia nada: en vertical es el scroll del panel, y el deslizador manda al moverse de lado o al tocar.
 */
/** Antes de esto en vertical el dedo quería bajar el panel. */
const SCROLL_SLOP_PX = 8
/** Desde esto de lado, el deslizador manda. */
const DRAG_SLOP_PX = 10

interface Gesture {
  x: number
  y: number
  pointerId: number
  engaged: boolean
}
export function Slider({ value, min, max, step, label, format, onInput, onChange, marks = [] }: SliderProps) {
  const track = useRef<HTMLDivElement>(null)
  const [dragging, setDragging] = useState<number | null>(null)
  const live = useRef(value)
  const gesture = useRef<Gesture | null>(null)
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
    gesture.current = { x: event.clientX, y: event.clientY, pointerId: event.pointerId, engaged: false }
  }

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const state = gesture.current
    if (!state) return
    if (!state.engaged) {
      const dx = event.clientX - state.x
      const dy = event.clientY - state.y
      if (Math.abs(dy) > SCROLL_SLOP_PX && Math.abs(dy) > Math.abs(dx)) {
        gesture.current = null
        return
      }
      if (Math.abs(dx) <= DRAG_SLOP_PX) return
      state.engaged = true
      try {
        event.currentTarget.setPointerCapture(state.pointerId)
      } catch {
        // El puntero puede haberse soltado ya: seguimos sin captura.
      }
      live.current = value
      setDragging(value)
    }
    preview(valueAt(event.clientX))
  }

  const finish = (event: ReactPointerEvent<HTMLDivElement>) => {
    const state = gesture.current
    gesture.current = null
    if (!state) return
    // Soltar sin haberse movido es un toque: el valor del punto tocado.
    if (!state.engaged) {
      const next = valueAt(event.clientX)
      if (next !== value) {
        haptic('selection')
        onChange(next)
      }
      return
    }
    setDragging(null)
    if (live.current !== value) onChange(live.current)
  }

  const cancel = () => {
    const engaged = gesture.current?.engaged
    gesture.current = null
    setDragging(null)
    // Lo previsualizado no se guarda: quien lo enseña (el círculo del mapa) vuelve al valor de antes.
    if (engaged) onInput?.(value)
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
            <span key={mark} style={{ left: `${((mark - min) / (max - min)) * 100}%` }}>
              {format(mark)}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
