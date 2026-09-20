import type { CSSProperties } from 'react'
import { MAX_IMPORTANCE, MIN_IMPORTANCE, importanceScale } from '../../lib/importance'
import { haptic } from '../../lib/platform/feedback'
import './importance.css'

const LEVELS = Array.from({ length: MAX_IMPORTANCE - MIN_IMPORTANCE + 1 }, (_, index) => MIN_IMPORTANCE + index)

interface ImportanceScaleProps {
  value: number
  onChange: (value: number) => void
}

/** La escala del 1 al 10 en el panel de la tarea: cada número crece como crecería el título. */
export function ImportanceScale({ value, onChange }: ImportanceScaleProps) {
  return (
    <div className="scale" role="radiogroup" aria-label="Importancia">
      {LEVELS.map((level) => (
        <button
          key={level}
          type="button"
          role="radio"
          aria-checked={level === value}
          className={`scale__step ${level === value ? 'is-active' : ''} ${level < value ? 'is-below' : ''}`}
          style={{ '--imp': importanceScale(level) } as CSSProperties}
          onClick={() => {
            if (level === value) return
            haptic('selection')
            onChange(level)
          }}
        >
          {level}
        </button>
      ))}
    </div>
  )
}
