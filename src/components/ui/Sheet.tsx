import { useEffect, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent, ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useCopy } from '../../state/LanguageProvider'
import './sheet.css'

const EXIT_MS = 220
/** Bajarlo más que esto, o de un golpe, lo cierra. */
const CLOSE_DRAG_PX = 110
const CLOSE_SPEED = 0.5
/** Hacia arriba no se va: cede un poco y vuelve, como una hoja sujeta. */
const PULL_UP_PX = 28
const VELOCITY_WINDOW_MS = 90

interface SheetProps {
  open: boolean
  /** Sin él, el panel solo se cierra desde dentro: sin asa, sin tocar fuera y sin Escape. */
  onClose?: () => void
  title: string
  children: ReactNode
  /** Fijo al pie, fuera del scroll (la acción principal): siempre a mano, también con el teclado fuera. */
  footer?: ReactNode
  /** Clase de más en la raíz (p. ej. para subirlo por encima de otra capa). */
  className?: string
}

/**
 * Panel que sube desde abajo. Se cierra tocando fuera, con Escape o arrastrando el asa: el panel
 * sigue al dedo en el mismo fotograma (sin pasar por React), el fondo se aclara a la vez y al soltar
 * cuenta la velocidad, así que un tirón corto basta. Hacia arriba solo cede con resistencia.
 */
const COPY = { es: { close: 'Cerrar' }, en: { close: 'Close' } } as const

export function Sheet({ open, onClose, title, children, footer, className = '' }: SheetProps) {
  const copy = useCopy(COPY)
  const [mounted, setMounted] = useState(open)
  const [shown, setShown] = useState(false)
  const panel = useRef<HTMLDivElement>(null)
  const scrim = useRef<HTMLElement>(null)
  const gesture = useRef<{ y: number; offset: number; samples: { y: number; t: number }[] } | null>(null)

  useEffect(() => {
    if (open) {
      // Si se reabre mientras aún baja tras un tirón, fuera lo que dejó puesto el gesto.
      for (const node of [panel.current, scrim.current]) {
        node?.style.removeProperty('transform')
        node?.style.removeProperty('transition')
        node?.style.removeProperty('opacity')
      }
      setMounted(true)
      const frame = requestAnimationFrame(() => setShown(true))
      return () => cancelAnimationFrame(frame)
    }
    setShown(false)
    const timer = setTimeout(() => setMounted(false), EXIT_MS)
    return () => clearTimeout(timer)
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose?.()
    }
    document.addEventListener('keydown', onKey)
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = previous
    }
  }, [open, onClose])

  if (!mounted) return null

  const paint = (offset: number, animate: boolean) => {
    const node = panel.current
    if (!node) return
    node.style.transition = animate ? '' : 'none'
    node.style.transform = offset ? `translate3d(0,${offset}px,0)` : ''
    const fade = scrim.current
    if (fade) {
      fade.style.transition = animate ? '' : 'none'
      fade.style.opacity = offset > 0 ? String(Math.max(0, 1 - offset / (node.offsetHeight || 1))) : ''
    }
  }

  const onHandleDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId)
    gesture.current = { y: event.clientY, offset: 0, samples: [{ y: event.clientY, t: event.timeStamp }] }
  }

  const onHandleMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const current = gesture.current
    if (!current) return
    const dy = event.clientY - current.y
    current.offset = dy >= 0 ? dy : -PULL_UP_PX * (1 - Math.exp(dy / 80))
    current.samples.push({ y: event.clientY, t: event.timeStamp })
    if (current.samples.length > 8) current.samples.shift()
    paint(current.offset, false)
  }

  /** Velocidad (px/ms) de los últimos ~90 ms del gesto, no de todo él: lo que cuenta es el tirón final. */
  const speedOf = (samples: { y: number; t: number }[]) => {
    const last = samples[samples.length - 1]
    if (!last) return 0
    const first = samples.find((sample) => last.t - sample.t <= VELOCITY_WINDOW_MS) ?? last
    return last.t > first.t ? (last.y - first.y) / (last.t - first.t) : 0
  }

  const onHandleUp = () => {
    const current = gesture.current
    gesture.current = null
    if (!current) return
    const speed = speedOf(current.samples)
    const closes = current.offset > CLOSE_DRAG_PX || (speed > CLOSE_SPEED && current.offset > 24)
    if (!closes) return paint(0, true)
    // Sigue bajando desde donde lo soltó el dedo, sin volver antes arriba.
    const node = panel.current
    if (node) {
      node.style.transition = `transform ${EXIT_MS}ms var(--ease-in)`
      node.style.transform = 'translate3d(0,101%,0)'
    }
    if (scrim.current) {
      scrim.current.style.transition = `opacity ${EXIT_MS}ms var(--ease)`
      scrim.current.style.opacity = '0'
    }
    onClose?.()
  }

  return createPortal(
    <div className={`sheet ${shown ? 'is-open' : ''} ${className}`} role="dialog" aria-modal="true" aria-label={title}>
      {onClose ? (
        <button
          ref={(node) => {
            scrim.current = node
          }}
          type="button"
          className="sheet__scrim"
          aria-label={copy.close}
          onClick={onClose}
        />
      ) : (
        <div
          ref={(node) => {
            scrim.current = node
          }}
          className="sheet__scrim"
        />
      )}
      <div ref={panel} className="sheet__panel">
        {onClose ? (
          <div
            className="sheet__grab"
            onPointerDown={onHandleDown}
            onPointerMove={onHandleMove}
            onPointerUp={onHandleUp}
            onPointerCancel={onHandleUp}
          >
            <span />
          </div>
        ) : (
          <div className="sheet__top" />
        )}
        <div className={`sheet__body ${footer ? 'has-foot' : ''}`}>{children}</div>
        {footer && <div className="sheet__foot">{footer}</div>}
      </div>
    </div>,
    document.body,
  )
}
