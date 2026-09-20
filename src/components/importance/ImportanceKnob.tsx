import { useRef, useState } from 'react'
import type { KeyboardEvent, MouseEvent, PointerEvent as ReactPointerEvent } from 'react'
import { MAX_IMPORTANCE, MIN_IMPORTANCE, clampImportance, importanceFromDrag, nextImportance } from '../../lib/importance'
import { haptic } from '../../lib/platform/feedback'
import './importance.css'

/** Por debajo de esto, soltar es un toque y no un arrastre. */
const TAP_SLOP_PX = 6

interface ImportanceKnobProps {
  value: number
  title: string
  /** Valor mientras se arrastra, para que el título crezca bajo el dedo; `null` al soltar. */
  onPreview: (value: number | null) => void
  onChange: (value: number) => void
}

interface Gesture {
  x: number
  y: number
  moved: boolean
}

/**
 * Mando de importancia de una fila (modo "Aa"), en el sitio del asa. Arrastrar hacia arriba o a la
 * derecha agranda el título y hacia abajo o a la izquierda lo encoge; tocarlo sube un punto. Cada
 * punto vibra, y el título cambia en vivo mientras se arrastra.
 */
export function ImportanceKnob({ value, title, onPreview, onChange }: ImportanceKnobProps) {
  const gesture = useRef<Gesture | null>(null)
  // Al soltar hay que leer el último valor real, no el del render anterior.
  const live = useRef(value)
  const [dragged, setDragged] = useState<number | null>(null)

  const preview = (next: number | null) => {
    setDragged(next)
    onPreview(next)
  }

  const onPointerDown = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return
    // El gesto es solo del mando: ni desliza la fila ni hace scroll.
    event.stopPropagation()
    event.currentTarget.setPointerCapture(event.pointerId)
    gesture.current = { x: event.clientX, y: event.clientY, moved: false }
    live.current = value
    setDragged(value)
  }

  const onPointerMove = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const start = gesture.current
    if (!start) return
    event.stopPropagation()
    const dx = event.clientX - start.x
    const dy = event.clientY - start.y
    if (!start.moved && Math.hypot(dx, dy) < TAP_SLOP_PX) return
    if (!start.moved) gesture.current = { ...start, moved: true }
    const next = importanceFromDrag(value, dx, dy)
    if (next === live.current) return
    live.current = next
    haptic('selection')
    preview(next)
  }

  const onPointerUp = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const start = gesture.current
    if (!start) return
    event.stopPropagation()
    gesture.current = null
    const next = start.moved ? live.current : nextImportance(value)
    if (!start.moved) haptic('selection')
    preview(null)
    if (next !== value) onChange(next)
  }

  const onPointerCancel = () => {
    gesture.current = null
    preview(null)
  }

  // Con el teclado (Intro o espacio) también sube un punto; con el dedo ya lo hizo `onPointerUp`.
  const onClick = (event: MouseEvent<HTMLButtonElement>) => {
    if (event.detail === 0) onChange(nextImportance(value))
  }

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    const up = event.key === 'ArrowUp' || event.key === 'ArrowRight'
    const down = event.key === 'ArrowDown' || event.key === 'ArrowLeft'
    if (!up && !down) return
    event.preventDefault()
    const next = clampImportance(value + (up ? 1 : -1))
    if (next !== value) onChange(next)
  }

  const current = dragged ?? value

  return (
    <button
      type="button"
      role="slider"
      className={`knob ${dragged !== null ? 'is-active' : ''} ${current > MIN_IMPORTANCE ? 'is-set' : ''}`}
      aria-label={`Importancia de «${title}»`}
      aria-valuemin={MIN_IMPORTANCE}
      aria-valuemax={MAX_IMPORTANCE}
      aria-valuenow={current}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      onClick={onClick}
      onKeyDown={onKeyDown}
      onContextMenu={(event) => event.preventDefault()}
    >
      <span className="knob__value">{current}</span>
    </button>
  )
}
