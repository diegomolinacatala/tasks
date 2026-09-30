import { useCallback } from 'react'
import type { CSSProperties, ReactNode, Ref } from 'react'
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
  children: ReactNode
}

/**
 * Fila deslizable: lo que asoma por detrás (hecha a la izquierda, borrar a la derecha) crece con el
 * gesto y da un pequeño salto al pasar el umbral, que es cuando vibra.
 */
export function SwipeRow({ onRight, onLeft, disabled, className = '', style, flip, nodeRef, children }: SwipeRowProps) {
  const { rootRef, surfaceRef, handlers } = useSwipe({ onLeft, onRight, disabled })

  const setRoot = useCallback(
    (node: HTMLLIElement | null) => {
      rootRef.current = node
      if (typeof nodeRef === 'function') nodeRef(node)
      else if (nodeRef) nodeRef.current = node
    },
    [rootRef, nodeRef],
  )

  return (
    <li ref={setRoot} className={`swipe ${className}`} style={style} data-flip={flip}>
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
      <div ref={surfaceRef} className="swipe__surface" {...handlers}>
        {children}
      </div>
    </li>
  )
}
