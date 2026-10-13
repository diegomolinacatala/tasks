import { useRef } from 'react'
import type { CSSProperties, PointerEvent as ReactPointerEvent } from 'react'
import { MAX_IMPORTANCE, MIN_IMPORTANCE, importanceScale } from '../../lib/importance'
import { haptic } from '../../lib/platform/feedback'
import { useCopy } from '../../state/LanguageProvider'
import './importance.css'

const LEVELS = Array.from({ length: MAX_IMPORTANCE - MIN_IMPORTANCE + 1 }, (_, index) => MIN_IMPORTANCE + index)

interface ImportanceScaleProps {
  value: number
  onChange: (value: number) => void
  /** Lo hecho vuelve al tamaño normal: la escala sigue ahí, atenuada. */
  done?: boolean
}

/**
 * La escala del 1 al 10 en el panel de la tarea: cada número crece como crecería el título. Se toca o
 * se arrastra de lado (cada paso vibra).
 */
const COPY = { es: { label: 'Importancia' }, en: { label: 'Importance' } } as const

export function ImportanceScale({ value, onChange, done = false }: ImportanceScaleProps) {
  const copy = useCopy(COPY)
  const row = useRef<HTMLDivElement>(null)
  // El último valor elegido, para no repetir el mismo al arrastrar (ni al soltar sobre el botón).
  const live = useRef(value)
  const dragging = useRef(false)

  const pick = (level: number) => {
    if (level === live.current && level === value) return
    live.current = level
    haptic('selection')
    onChange(level)
  }

  const levelAt = (clientX: number) => {
    const rect = row.current?.getBoundingClientRect()
    if (!rect?.width) return value
    const index = Math.floor(((clientX - rect.left) / rect.width) * LEVELS.length)
    return LEVELS[Math.min(LEVELS.length - 1, Math.max(0, index))] ?? value
  }

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return
    live.current = value
    dragging.current = true
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (dragging.current) pick(levelAt(event.clientX))
  }

  const stop = () => {
    dragging.current = false
  }

  return (
    <div
      ref={row}
      className={`scale ${done ? 'is-done' : ''}`}
      role="radiogroup"
      aria-label={copy.label}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={stop}
      onPointerCancel={stop}
    >
      {LEVELS.map((level) => (
        <button
          key={level}
          type="button"
          role="radio"
          aria-checked={level === value}
          className={`scale__step ${level === value ? 'is-active' : ''} ${level < value ? 'is-below' : ''}`}
          style={{ '--imp': importanceScale(level) } as CSSProperties}
          onClick={() => pick(level)}
        >
          {level}
        </button>
      ))}
    </div>
  )
}
