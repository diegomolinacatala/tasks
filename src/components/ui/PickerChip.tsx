import { useEffect, useRef, useState } from 'react'
import type { MouseEvent, ReactNode } from 'react'

type PickerType = 'date' | 'time' | 'datetime-local'

interface PickerChipProps {
  type: PickerType
  /** Lo guardado ahora mismo; `''` si no hay nada. */
  value: string
  /** Una sola vez, al cerrar el selector, y solo si lo elegido es distinto de lo guardado. */
  onCommit: (value: string) => void
  /** Al tocar la píldora, antes de elegir nada. */
  onOpen?: () => void
  className?: string
  children: ReactNode
}

/**
 * Píldora que abre el selector nativo de fecha u hora. iOS lanza `input` con cada giro de la
 * rueda: guardar ahí fijaba valores de paso (un aviso con la primera hora por la que pasaba, o un
 * "Hasta…" anterior al inicio que se recortaba a 12 h y hacía saltar la rueda a otra hora). Por
 * eso lo elegido se queda en borrador y se guarda al cerrar el selector.
 */
export function PickerChip({ type, value, onCommit, onOpen, className = 'chip', children }: PickerChipProps) {
  const [draft, setDraft] = useState<string | null>(null)
  // Si el panel se cierra con el selector abierto, el `blur` llega tarde o no llega: se guarda al desmontar.
  const pending = useRef<{ draft: string | null; value: string; onCommit: (value: string) => void }>({
    draft: null,
    value,
    onCommit,
  })

  useEffect(() => {
    pending.current = { draft, value, onCommit }
  })

  useEffect(
    () => () => {
      const { draft: last, value: saved, onCommit: commit } = pending.current
      if (last !== null && last !== saved) commit(last)
    },
    [],
  )

  const finish = (next: string) => {
    pending.current = { ...pending.current, draft: null }
    setDraft(null)
    if (next !== value) onCommit(next)
  }

  // En el ordenador el selector no se abre solo al enfocar: se pide (Chrome, Edge, Safari 16+).
  const openPicker = (event: MouseEvent<HTMLLabelElement>) => {
    onOpen?.()
    const input = event.currentTarget.querySelector('input')
    if (!input || !window.matchMedia('(pointer: fine)').matches) return
    try {
      input.showPicker()
    } catch {
      // Sin showPicker el enfoque basta: se escribe con el teclado.
    }
  }

  return (
    <label className={className} onClick={openPicker}>
      {children}
      <input
        type={type}
        className="sr-only"
        value={draft ?? value}
        onFocus={() => setDraft(value)}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={(event) => finish(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') event.currentTarget.blur()
        }}
      />
    </label>
  )
}
