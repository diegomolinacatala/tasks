import { useCallback, useEffect, useRef } from 'react'
import type { CSSProperties, MouseEvent as ReactMouseEvent, ReactNode, Ref } from 'react'
import type { DraggableSyntheticListeners } from '@dnd-kit/core'
import { IconCheck, IconTrash } from '../ui/Icons'
import { useSwipe } from './useSwipe'
import './task.css'

interface SwipeRowProps {
  /** A la derecha: completar (o tachar la rutina). */
  onRight?: () => void
  /** A la izquierda: borrar. Sin ella, ese lado solo ofrece resistencia. */
  onLeft?: () => void
  disabled?: boolean
  className?: string
  style?: CSSProperties
  /** Para `lib/flip.ts`: la fila se desliza a su sitio nuevo tras un cambio. */
  flip?: string
  /** La del arrastre (dnd-kit), que también necesita el nodo. */
  nodeRef?: Ref<HTMLLIElement>
  /** Mantener pulsada la fila la coge para arrastrarla (los oyentes del dedo y el ratón de dnd-kit). */
  hold?: DraggableSyntheticListeners
  /** Id con el que se coge: la fila se hunde un poco mientras se mantiene (`pressCue`). */
  dragId?: string
  children: ReactNode
}

/** Lo que tarda en olvidarse que se acaba de soltar: el clic que llega detrás no abre la tarea. */
const AFTER_DRAG_MS = 450

/**
 * Fila deslizable: lo que asoma por detrás (hecha a la izquierda, borrar a la derecha) crece con el
 * gesto y da un pequeño salto al pasar el umbral, que es cuando vibra.
 */
export function SwipeRow({ onRight, onLeft, disabled, className = '', style, flip, nodeRef, hold, dragId, children }: SwipeRowProps) {
  const { rootRef, surfaceRef, handlers } = useSwipe({ onLeft, onRight, disabled })
  // Tras arrastrarla (`disabled` mientras dura), soltar sin moverse no debe abrirla.
  const dragged = useRef(false)
  useEffect(() => {
    if (disabled) {
      dragged.current = true
      return
    }
    const timer = window.setTimeout(() => (dragged.current = false), AFTER_DRAG_MS)
    return () => window.clearTimeout(timer)
  }, [disabled])
  const onClickCapture = (event: ReactMouseEvent) => {
    if (dragged.current) {
      dragged.current = false
      event.preventDefault()
      event.stopPropagation()
      return
    }
    handlers.onClickCapture(event)
  }

  const setRoot = useCallback(
    (node: HTMLLIElement | null) => {
      rootRef.current = node
      if (typeof nodeRef === 'function') nodeRef(node)
      else if (nodeRef) nodeRef.current = node
    },
    [rootRef, nodeRef],
  )

  return (
    <li ref={setRoot} className={`swipe ${className}`} style={style} data-flip={flip} data-drag-id={dragId}>
      <div className="swipe__behind" aria-hidden="true">
        <span className="swipe__act swipe__act--right">
          <IconCheck size={18} strokeWidth={2.2} />
        </span>
        {onLeft && (
          <span className="swipe__act swipe__act--left">
            <IconTrash size={18} />
          </span>
        )}
      </div>
      <div
        ref={surfaceRef}
        className="swipe__surface"
        {...hold}
        {...handlers}
        onClickCapture={onClickCapture}
        // Mantener pulsado es coger la fila: ni menú ni lupa del sistema.
        onContextMenu={hold ? (event) => event.preventDefault() : undefined}
      >
        {children}
      </div>
    </li>
  )
}
