import { useRef } from 'react'
import type { PointerEvent } from 'react'

/** Tirar más que esto hacia arriba, o de un golpe, despliega. */
const OPEN_PX = 40
const OPEN_SPEED = 0.4
/** Menos que esto es un toque: también despliega. */
const TAP_PX = 6
/** La barra cede hacia arriba con resistencia: insinúa que se abre, no se despega. */
const MAX_LIFT = 34

/**
 * El asa de la barra de escribir, como la del mini reproductor de Spotify: tirar hacia arriba (o
 * tocarla) despliega la ficha. Mientras se tira, la barra sube un poco con el dedo, en el mismo
 * fotograma y sin pasar por React; al soltar vuelve a su sitio.
 */
export function usePullUp<T extends HTMLElement>(onOpen: () => void) {
  const card = useRef<T>(null)
  const gesture = useRef<{ y: number; t: number; dy: number } | null>(null)

  const paint = (lift: number, animate: boolean) => {
    const node = card.current
    if (!node) return
    node.style.transition = animate ? '' : 'none'
    node.style.transform = lift ? `translate3d(0,${-lift}px,0)` : ''
  }

  const end = (event: PointerEvent<HTMLElement>, cancelled: boolean) => {
    const current = gesture.current
    gesture.current = null
    if (!current) return
    paint(0, true)
    if (cancelled) return
    const speed = current.dy / Math.max(1, event.timeStamp - current.t)
    if (Math.abs(current.dy) < TAP_PX || current.dy > OPEN_PX || speed > OPEN_SPEED) onOpen()
  }

  const handlers = {
    onPointerDown(event: PointerEvent<HTMLElement>) {
      event.currentTarget.setPointerCapture(event.pointerId)
      gesture.current = { y: event.clientY, t: event.timeStamp, dy: 0 }
    },
    onPointerMove(event: PointerEvent<HTMLElement>) {
      const current = gesture.current
      if (!current) return
      current.dy = current.y - event.clientY
      paint(current.dy > 0 ? MAX_LIFT * (1 - Math.exp(-current.dy / 90)) : 0, false)
    },
    onPointerUp: (event: PointerEvent<HTMLElement>) => end(event, false),
    onPointerCancel: (event: PointerEvent<HTMLElement>) => end(event, true),
  }

  return { card, handlers }
}
