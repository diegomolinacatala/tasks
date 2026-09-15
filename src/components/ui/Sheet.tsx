import { useEffect, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent, ReactNode } from 'react'
import { createPortal } from 'react-dom'
import './sheet.css'

const EXIT_MS = 220
const CLOSE_DRAG_PX = 90

interface SheetProps {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
}

export function Sheet({ open, onClose, title, children }: SheetProps) {
  const [mounted, setMounted] = useState(open)
  const [shown, setShown] = useState(false)
  const [dragY, setDragY] = useState(0)
  const startY = useRef(0)
  // Al soltar hay que leer el desplazamiento real, no el del último render.
  const dragged = useRef(0)
  const panel = useRef<HTMLDivElement>(null)

  const drag = (value: number) => {
    dragged.current = value
    setDragY(value)
  }

  useEffect(() => {
    if (open) {
      setMounted(true)
      dragged.current = 0
      setDragY(0)
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
      if (event.key === 'Escape') onClose()
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

  const onHandleDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    startY.current = event.clientY
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const onHandleMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return
    drag(Math.max(0, event.clientY - startY.current))
  }

  const onHandleUp = () => {
    if (dragged.current > CLOSE_DRAG_PX) onClose()
    drag(0)
  }

  return createPortal(
    <div className={`sheet ${shown ? 'is-open' : ''}`} role="dialog" aria-modal="true" aria-label={title}>
      <button type="button" className="sheet__scrim" aria-label="Cerrar" onClick={onClose} />
      <div
        ref={panel}
        className="sheet__panel"
        style={dragY ? { transform: `translateY(${dragY}px)`, transition: 'none' } : undefined}
      >
        <div
          className="sheet__grab"
          onPointerDown={onHandleDown}
          onPointerMove={onHandleMove}
          onPointerUp={onHandleUp}
          onPointerCancel={onHandleUp}
        >
          <span />
        </div>
        <div className="sheet__body">{children}</div>
      </div>
    </div>,
    document.body,
  )
}
