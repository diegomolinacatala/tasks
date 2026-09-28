import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import './toast.css'

const VISIBLE_MS = 4200
/** Lo que dura `toast-out` (--dur-2): después se desmonta. */
const LEAVE_MS = 220

interface ToastRequest {
  message: string
  actionLabel?: string
  onAction?: () => void
}

interface ToastEntry extends ToastRequest {
  id: number
  leaving: boolean
}

const ToastContext = createContext<((toast: ToastRequest) => void) | null>(null)

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<ToastEntry | null>(null)
  const counter = useRef(0)

  const show = useCallback((request: ToastRequest) => {
    counter.current += 1
    setToast({ ...request, id: counter.current, leaving: false })
  }, [])

  const dismiss = useCallback(() => setToast((current) => (current ? { ...current, leaving: true } : null)), [])

  useEffect(() => {
    if (!toast) return
    const timer = toast.leaving ? setTimeout(() => setToast(null), LEAVE_MS) : setTimeout(dismiss, VISIBLE_MS)
    return () => clearTimeout(timer)
  }, [toast, dismiss])

  return (
    <ToastContext.Provider value={show}>
      {children}
      {toast && (
        <div className={`toast ${toast.leaving ? 'is-leaving' : ''}`} role="status" key={toast.id}>
          <span className="toast__text">{toast.message}</span>
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
        </div>
      )}
    </ToastContext.Provider>
  )
}

export function useToast() {
  const show = useContext(ToastContext)
  if (!show) throw new Error('useToast debe usarse dentro de <ToastProvider>')
  return show
}
