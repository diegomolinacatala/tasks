import { useEffect, useRef } from 'react'
import type { NotificationEvent } from '../../lib/nativeEvents'
import { isNative } from '../../lib/platform'
import { isNotificationAction, isOpenTaskMessage } from '../../lib/push/message'

const PARAM = 'task'
const ACTION_PARAM = 'action'

/**
 * Tocar un aviso. PWA: por URL si la app estaba cerrada, o por mensaje del service worker si
 * ya estaba abierta. App nativa: por el evento del plugin de notificaciones.
 */
export function useNotificationOpen(onEvent: (event: NotificationEvent) => void) {
  const callback = useRef(onEvent)

  useEffect(() => {
    callback.current = onEvent
  }, [onEvent])

  useEffect(() => {
    if (!isNative) return
    let stop: (() => void) | null = null
    let cancelled = false
    void import('../../lib/platform/notifications').then(({ onNotificationEvent }) => {
      if (!cancelled) stop = onNotificationEvent((event) => callback.current(event))
    })
    return () => {
      cancelled = true
      stop?.()
    }
  }, [])

  useEffect(() => {
    if (isNative) return
    const url = new URL(window.location.href)
    const taskId = url.searchParams.get(PARAM)
    const action = url.searchParams.get(ACTION_PARAM)
    // Sin tarea solo cuenta "Pasar a hoy" del resumen diario; lo demás necesita una tarea.
    const fromWeb = (id: string | null, raw: string | null | undefined): NotificationEvent | null => {
      if (id) return { action: isNotificationAction(raw) ? raw : 'open', taskIds: [id], placeId: null }
      return raw === 'today' ? { action: 'today', taskIds: [], placeId: null } : null
    }
    const opened = fromWeb(taskId, action)
    if (taskId || action) {
      url.searchParams.delete(PARAM)
      url.searchParams.delete(ACTION_PARAM)
      window.history.replaceState(null, '', url.pathname + url.search + url.hash)
    }
    if (opened) callback.current(opened)

    if (!('serviceWorker' in navigator)) return
    const onMessage = (event: MessageEvent) => {
      const message = isOpenTaskMessage(event.data) ? fromWeb(event.data.taskId, event.data.action) : null
      if (message) callback.current(message)
    }
    navigator.serviceWorker.addEventListener('message', onMessage)
    return () => navigator.serviceWorker.removeEventListener('message', onMessage)
  }, [])
}
