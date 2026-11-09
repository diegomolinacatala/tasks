import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { createPortal } from 'react-dom'
import './toast.css'

/** Un aviso informativo se lee de un vistazo. */
const VISIBLE_MS = 4200
/** Uno con acción es una decisión, y uno largo hay que leerlo: duran más. */
const LONG_VISIBLE_MS = 6500
const LONG_TEXT = 60
/** Lo que dura `toast-out` (--dur-2): después se desmonta. */
const LEAVE_MS = 220

interface ToastRequest {
  message: string
  actionLabel?: string
  onAction?: () => void
  /** Un fallo se anuncia como alerta al lector de pantalla. */
  tone?: 'error'
}

interface ToastEntry extends ToastRequest {
  id: number
  leaving: boolean
}

const ToastContext = createContext<((toast: ToastRequest) => void) | null>(null)

const durationOf = (request: ToastRequest) =>
  request.actionLabel || request.message.length > LONG_TEXT ? LONG_VISIBLE_MS : VISIBLE_MS

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<ToastEntry | null>(null)
  const counter = useRef(0)
  // Un aviso sin acción no pisa un «Deshacer» vivo: espera a que se vaya (cola de uno).
  const queued = useRef<ToastRequest | null>(null)

  const show = useCallback((request: ToastRequest) => {
    setToast((current) => {
      if (current && !current.leaving && current.actionLabel && !request.actionLabel) {
        queued.current = request
        return current
      }
      queued.current = null
      counter.current += 1
      return { ...request, id: counter.current, leaving: false }
    })
  }, [])

  const dismiss = useCallback(() => setToast((current) => (current ? { ...current, leaving: true } : null)), [])

  useEffect(() => {
    if (!toast) {
      const next = queued.current
      if (next) {
        queued.current = null
        show(next)
      }
      return
    }
    const timer = toast.leaving ? setTimeout(() => setToast(null), LEAVE_MS) : setTimeout(dismiss, durationOf(toast))
    return () => clearTimeout(timer)
  }, [toast, dismiss, show])

  return (
    <ToastContext.Provider value={show}>
      {children}
      {toast &&
        createPortal(
          <div
            className={`toast ${toast.leaving ? 'is-leaving' : ''}`}
            role={toast.tone === 'error' ? 'alert' : 'status'}
            key={toast.id}
          >
            {/* Tocar el texto lo descarta: no hay que esperar a que se vaya */}
            <span className="toast__text" onClick={dismiss}>
              {toast.message}
            </span>
            {toast.actionLabel && (
              <button
                type="button"
                className="toast__action"
                disabled={toast.leaving}
                onClick={() => {
                  toast.onAction?.()
                  dismiss()
                }}
              >
                {toast.actionLabel}
              </button>
            )}
          </div>,
          document.body,
        )}
    </ToastContext.Provider>
  )
}

export function useToast() {
  const show = useContext(ToastContext)
  if (!show) throw new Error('useToast debe usarse dentro de <ToastProvider>')
  return show
}
