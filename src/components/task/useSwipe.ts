import { useCallback, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'

const DIRECTION_LOCK_PX = 10
const SCROLL_LOCK_PX = 8
const TRIGGER_PX = 84
const MAX_PX = 140

type Mode = 'idle' | 'swipe' | 'scroll'

/** Resistencia al pasar del umbral: el dedo sigue moviéndose, la fila no. */
function damp(delta: number): number {
  const sign = Math.sign(delta)
  const value = Math.abs(delta)
  if (value <= TRIGGER_PX) return delta
  return sign * Math.min(MAX_PX, TRIGGER_PX + (value - TRIGGER_PX) * 0.35)
}

const buzz = () => navigator.vibrate?.(8)

interface SwipeOptions {
  onLeft: () => void
  onRight: () => void
  /** `left` sale volando (borrar), `right` vuelve a su sitio (completar). */
  flingLeft?: boolean
  disabled?: boolean
}

export function useSwipe({ onLeft, onRight, flingLeft = true, disabled = false }: SwipeOptions) {
  const [offset, setOffset] = useState(0)
  const [settling, setSettling] = useState(true)
  const origin = useRef<{ x: number; y: number } | null>(null)
  const mode = useRef<Mode>('idle')
  // El desplazamiento también vive en un ref: al soltar hay que leer el valor real,
  // no el que hubiera en el render anterior.
  const travelled = useRef(0)

  const move = useCallback((value: number) => {
    travelled.current = value
    setOffset(value)
  }, [])

  const reset = useCallback(() => {
    origin.current = null
    mode.current = 'idle'
    setSettling(true)
    move(0)
  }, [move])

  const onPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      if (disabled || (event.pointerType === 'mouse' && event.button !== 0)) return
      origin.current = { x: event.clientX, y: event.clientY }
      mode.current = 'idle'
    },
    [disabled],
  )

  const onPointerMove = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    const start = origin.current
    if (!start) return
    const dx = event.clientX - start.x
    const dy = event.clientY - start.y

    if (mode.current === 'idle') {
      if (Math.abs(dy) > SCROLL_LOCK_PX && Math.abs(dy) > Math.abs(dx)) {
        mode.current = 'scroll'
        origin.current = null
        return
      }
      if (Math.abs(dx) <= DIRECTION_LOCK_PX || Math.abs(dx) <= Math.abs(dy)) return
      mode.current = 'swipe'
      setSettling(false)
      try {
        event.currentTarget.setPointerCapture(event.pointerId)
      } catch {
        // El puntero puede haberse soltado ya: seguimos sin captura.
      }
    }

    if (mode.current === 'swipe') move(damp(dx))
  }, [move])

  const onPointerUp = useCallback(() => {
    if (mode.current !== 'swipe') {
      reset()
      return
    }
    const distance = travelled.current
    setSettling(true)

    if (distance >= TRIGGER_PX) {
      buzz()
      move(0)
      origin.current = null
      mode.current = 'idle'
      onRight()
      return
    }

    if (distance <= -TRIGGER_PX) {
      buzz()
      origin.current = null
      mode.current = 'idle'
      if (flingLeft) {
        move(-window.innerWidth)
        setTimeout(onLeft, 160)
      } else {
        move(0)
        onLeft()
      }
      return
    }

    reset()
  }, [move, onLeft, onRight, flingLeft, reset])

  return {
    offset,
    settling,
    handlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp,
      onPointerCancel: reset,
    },
  }
}

export const SWIPE_TRIGGER_PX = TRIGGER_PX
