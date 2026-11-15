import { useCallback, useEffect, useRef, useState } from 'react'
import { IconCheck } from '../ui/Icons'

export interface MiniItem {
  id: number
  title: string
  meta?: string
  done: boolean
}

interface MiniListProps {
  /** Para el lector de pantalla: de qué dispositivo es esta lista. */
  label: string
  items: readonly MiniItem[]
  /** Lo que acaba de llegar del otro dispositivo: se ilumina un momento. */
  flash: ReadonlySet<number>
  onToggle: (id: number) => void
  /** Cuánto se ve: en la pantalla pequeña, sin la línea de debajo. */
  compact?: boolean
}

/**
 * Una lista de juguete para las láminas de vincular y de cestas compartidas: la misma en los dos
 * dispositivos, y lo que cambia en uno se ilumina en el otro.
 */
export function MiniList({ label, items, flash, onToggle, compact = false }: MiniListProps) {
  const pending = items.filter((item) => !item.done)
  const done = items.filter((item) => item.done)
  return (
    <ul className={`mini-list ${compact ? 'is-compact' : ''}`} aria-label={label}>
      {[...pending, ...done].map((item) => (
        <li key={item.id} className={`mini-list__row ${flash.has(item.id) ? 'is-flash' : ''}`}>
          <button type="button" className={`mini-list__item ${item.done ? 'is-done' : ''}`} aria-pressed={item.done} onClick={() => onToggle(item.id)}>
            <span className="mini-list__check" aria-hidden="true">
              <IconCheck size={9} strokeWidth={3} />
            </span>
            <span className="mini-list__title">{item.title}</span>
            {item.meta && !compact && <span className="mini-list__meta">{item.meta}</span>}
          </button>
        </li>
      ))}
    </ul>
  )
}

/** Cuánto dura el destello de lo que llega. */
const FLASH_MS = 1100

const without = (set: ReadonlySet<number>, id: number): ReadonlySet<number> => new Set([...set].filter((entry) => entry !== id))

/**
 * Los destellos de un dispositivo: `flash(id)` ilumina esa fila un momento. Un temporizador por fila: si
 * vuelve a llegar algo antes de que se apague, el destello empieza otra vez (se quita y se pone un
 * fotograma después, para que la animación se repita).
 */
export function useFlash(): [ReadonlySet<number>, (id: number) => void] {
  const [lit, setLit] = useState<ReadonlySet<number>>(() => new Set())
  const timers = useRef(new Map<number, number>())
  useEffect(() => {
    const pending = timers.current
    return () => pending.forEach((timer) => window.clearTimeout(timer))
  }, [])
  const flash = useCallback((id: number) => {
    window.clearTimeout(timers.current.get(id))
    setLit((current) => without(current, id))
    timers.current.set(
      id,
      window.setTimeout(() => {
        setLit((current) => new Set([...current, id]))
        timers.current.set(
          id,
          window.setTimeout(() => {
            timers.current.delete(id)
            setLit((current) => without(current, id))
          }, FLASH_MS),
        )
      }, 16),
    )
  }, [])
  return [lit, flash]
}
