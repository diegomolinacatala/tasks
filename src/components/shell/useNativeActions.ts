import { useEffect, useRef } from 'react'
import type { PluginListenerHandle } from '@capacitor/core'
import { parseNativeAction } from '../../lib/nativeEvents'
import { isNative } from '../../lib/platform'

interface NativeActionHandlers {
  /** Siri: "Añade una tarea en Tasks". */
  onAdd: (text: string) => void
  /** Acceso rápido "Nueva tarea". */
  onCompose: () => void
  /** Acceso rápido "Semana" y "Mi semana en Tasks". */
  onWeek: () => void
}

/** Acciones que llegan de fuera de la web en la app de iPhone. */
export function useNativeActions(handlers: NativeActionHandlers) {
  const current = useRef(handlers)

  useEffect(() => {
    current.current = handlers
  })

  useEffect(() => {
    if (!isNative) return
    let handle: PluginListenerHandle | null = null
    let cancelled = false
    void import('../../lib/platform/native')
      .then(({ TasksNative }) =>
        TasksNative.addListener('action', (raw) => {
          const action = parseNativeAction(raw)
          if (action?.type === 'add') current.current.onAdd(action.text)
          if (action?.type === 'compose') current.current.onCompose()
          if (action?.type === 'week') current.current.onWeek()
        }),
      )
      .then((registered) => {
        if (cancelled) void registered.remove()
        else handle = registered
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
      void handle?.remove()
    }
  }, [])
}
