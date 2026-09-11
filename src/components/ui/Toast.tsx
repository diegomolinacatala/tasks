import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import './toast.css'

const VISIBLE_MS = 4200

interface ToastRequest {
  message: string
  actionLabel?: string
  onAction?: () => void
}

interface ToastEntry extends ToastRequest {
  id: number
}

const ToastContext = createContext<((toast: ToastRequest) => void) | null>(null)

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<ToastEntry | null>(null)
  const counter = useRef(0)

  const show = useCallback((request: ToastRequest) => {
    counter.current += 1
    setToast({ ...request, id: counter.current })
  }, [])

  useEffect(() => {
    if (!toast) return
    const timer = setTimeout(() => setToast(null), VISIBLE_MS)
    return () => clearTimeout(timer)
  }, [toast])

  return (
    <ToastContext.Provider value={show}>
      {children}
      {toast && (
        <div className="toast" role="status" key={toast.id}>
          <span className="toast__text">{toast.message}</span>
          {toast.actionLabel && (
            <button
              type="button"
              className="toast__action"
              onClick={() => {
                toast.onAction?.()
                setToast(null)
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
