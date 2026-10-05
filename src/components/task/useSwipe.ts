import { useCallback, useEffect, useRef } from 'react'
import type { MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent } from 'react'
import { haptic } from '../../lib/platform/feedback'

/**
 * Deslizar una fila, como en Mail o Things: a la derecha completa, a la izquierda borra. El gesto no
 * pasa por React: cada movimiento escribe directamente el `transform` de la fila en el siguiente
 * fotograma (antes, un render por evento hacía que en móviles modestos la fila fuera a saltos). Al
 * soltar cuenta también la velocidad: un golpe rápido basta aunque no llegue al umbral.
 */

const DIRECTION_LOCK_PX = 10
const SCROLL_LOCK_PX = 8
export const SWIPE_TRIGGER_PX = 84
const MAX_PX = 150
/** Un golpe más rápido que esto (px/ms) cuenta aunque no llegue al umbral… */
const FLICK_SPEED = 0.55
/** …siempre que haya recorrido al menos esto. */
const FLICK_MIN_PX = 36
/** Velocidad medida sobre los últimos milisegundos del gesto, no sobre todo él. */
const VELOCITY_WINDOW_MS = 90
/** Resistencia en un sentido sin acción: se nota que no lleva a nada. */
const BLOCKED_PX = 22
const SETTLE_MS = 320
const FLING_MS = 200

type Mode = 'idle' | 'swipe' | 'scroll'

interface Sample {
  x: number
  t: number
}

/** Pasado el umbral, el dedo sigue y la fila apenas: se nota el tope. */
function damp(delta: number, allowed: boolean): number {
  const sign = Math.sign(delta)
  const value = Math.abs(delta)
  if (!allowed) return sign * BLOCKED_PX * (1 - Math.exp(-value / 60))
  if (value <= SWIPE_TRIGGER_PX) return delta
  return sign * Math.min(MAX_PX, SWIPE_TRIGGER_PX + (value - SWIPE_TRIGGER_PX) * 0.35)
}

interface SwipeOptions {
  /** Sin ella, deslizar a la izquierda solo ofrece resistencia. */
  onLeft?: () => void
  onRight?: () => void
  disabled?: boolean
}

export function useSwipe({ onLeft, onRight, disabled = false }: SwipeOptions) {
  const rootRef = useRef<HTMLElement | null>(null)
  const surfaceRef = useRef<HTMLDivElement | null>(null)
  const mode = useRef<Mode>('idle')
  const origin = useRef<{ x: number; y: number } | null>(null)
  const samples = useRef<Sample[]>([])
  const offset = useRef(0)
  const armed = useRef(false)
  const frame = useRef(0)
  const suppressClick = useRef(false)
  const timers = useRef(new Set<number>())
  // Las acciones más recientes, sin volver a crear los manejadores en cada render.
  const actions = useRef({ onLeft, onRight })
  actions.current = { onLeft, onRight }
  // Si la fila se coge para arrastrarla a medio gesto, deslizar se acaba ahí.
  const off = useRef(disabled)
  off.current = disabled

  /** Un temporizador que se borra solo al saltar y se cancela si la fila se desmonta u oculta. */
  const later = useCallback((run: () => void, ms: number) => {
    const timer = window.setTimeout(() => {
      timers.current.delete(timer)
      run()
    }, ms)
    timers.current.add(timer)
  }, [])

  // También al ocultarse la pestaña (`Activity`): al volver, todo empieza de cero.
  useEffect(
    () => () => {
      cancelAnimationFrame(frame.current)
      frame.current = 0
      timers.current.forEach((timer) => window.clearTimeout(timer))
      timers.current.clear()
    },
    [],
  )

  const paint = useCallback(() => {
    frame.current = 0
    const surface = surfaceRef.current
    const root = rootRef.current
    if (!surface || !root) return
    const value = offset.current
    surface.style.transform = value ? `translate3d(${value}px,0,0)` : ''
    root.style.setProperty('--swipe', String(Math.min(1, Math.abs(value) / SWIPE_TRIGGER_PX)))
    root.classList.toggle('is-swipe-right', value > 0)
    root.classList.toggle('is-swipe-left', value < 0)
    root.classList.toggle('is-armed', armed.current)
  }, [])

  const schedule = useCallback(() => {
    if (!frame.current) frame.current = requestAnimationFrame(paint)
  }, [paint])

  /** Lleva la fila a `target` con transición; `after` se llama al terminar. */
  const settle = useCallback(
    (target: number, duration = SETTLE_MS, easing = 'var(--ease-out)') => {
      const surface = surfaceRef.current
      if (!surface) return
      cancelAnimationFrame(frame.current)
      frame.current = 0
      surface.style.transition = `transform ${duration}ms ${easing}`
      offset.current = target
      armed.current = false
      paint()
      later(() => {
        if (!surfaceRef.current) return
        surfaceRef.current.style.transition = ''
        surfaceRef.current.style.willChange = ''
      }, duration)
    },
    [paint, later],
  )

  const reset = useCallback(() => {
    origin.current = null
    const wasSwiping = mode.current === 'swipe'
    mode.current = 'idle'
    if (wasSwiping || offset.current) settle(0)
  }, [settle])

  const onPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (disabled || (event.pointerType === 'mouse' && event.button !== 0)) return
      origin.current = { x: event.clientX, y: event.clientY }
      samples.current = [{ x: event.clientX, t: event.timeStamp }]
      mode.current = 'idle'
    },
    [disabled],
  )

  const onPointerMove = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const start = origin.current
      if (!start || mode.current === 'scroll') return
      if (off.current) {
        origin.current = null
        return
      }
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
        const surface = surfaceRef.current
        if (surface) {
          surface.style.transition = 'none'
          surface.style.willChange = 'transform'
        }
        try {
          event.currentTarget.setPointerCapture(event.pointerId)
        } catch {
          // El puntero puede haberse soltado ya: seguimos sin captura.
        }
      }

      const allowed = dx > 0 ? Boolean(actions.current.onRight) : Boolean(actions.current.onLeft)
      offset.current = damp(dx, allowed)
      const nowArmed = allowed && Math.abs(offset.current) >= SWIPE_TRIGGER_PX
      if (nowArmed !== armed.current) {
        armed.current = nowArmed
        if (nowArmed) haptic('selection')
      }
      samples.current.push({ x: event.clientX, t: event.timeStamp })
      if (samples.current.length > 8) samples.current.shift()
      schedule()
    },
    [schedule],
  )

  const velocity = () => {
    const list = samples.current
    const last = list[list.length - 1]
    if (!last) return 0
    const first = list.find((sample) => last.t - sample.t <= VELOCITY_WINDOW_MS) ?? last
    const elapsed = last.t - first.t
    return elapsed > 0 ? (last.x - first.x) / elapsed : 0
  }

  const onPointerUp = useCallback(() => {
    if (mode.current !== 'swipe') {
      origin.current = null
      mode.current = 'idle'
      return
    }
    mode.current = 'idle'
    origin.current = null
    // El `click` que llega detrás de un deslizamiento no debe abrir la tarea.
    suppressClick.current = true
    later(() => (suppressClick.current = false), 400)

    const distance = offset.current
    const speed = velocity()
    const { onLeft: left, onRight: right } = actions.current
    const toRight = distance > 0 && right && (distance >= SWIPE_TRIGGER_PX || (speed > FLICK_SPEED && distance > FLICK_MIN_PX))
    const toLeft = distance < 0 && left && (distance <= -SWIPE_TRIGGER_PX || (speed < -FLICK_SPEED && distance < -FLICK_MIN_PX))

    if (toRight && right) {
      if (!armed.current) haptic('selection')
      settle(0, SETTLE_MS, 'var(--ease-pop)')
      right()
      return
    }
    if (toLeft && left) {
      if (!armed.current) haptic('selection')
      const width = rootRef.current?.offsetWidth ?? window.innerWidth
      settle(-width, FLING_MS, 'var(--ease-in)')
      later(left, FLING_MS - 40)
      return
    }
    settle(0)
  }, [settle, later])

  const onClickCapture = useCallback((event: ReactMouseEvent) => {
    if (!suppressClick.current) return
    suppressClick.current = false
    event.preventDefault()
    event.stopPropagation()
  }, [])

  return {
    rootRef,
    surfaceRef,
    handlers: { onPointerDown, onPointerMove, onPointerUp, onPointerCancel: reset, onClickCapture },
  }
}
