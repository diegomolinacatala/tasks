import { useEffect, useRef } from 'react'
import { isOpenTaskMessage } from '../../lib/push/message'

const PARAM = 'task'

/**
 * Tocar un aviso abre la tarea: por URL si la app estaba cerrada, o por mensaje del
 * service worker si ya estaba abierta.
 */
export function useNotificationOpen(onOpen: (taskId: string) => void) {
  const callback = useRef(onOpen)

  useEffect(() => {
    callback.current = onOpen
  }, [onOpen])

  useEffect(() => {
    const url = new URL(window.location.href)
    const taskId = url.searchParams.get(PARAM)
    if (taskId) {
      url.searchParams.delete(PARAM)
      window.history.replaceState(null, '', url.pathname + url.search + url.hash)
      callback.current(taskId)
    }

    if (!('serviceWorker' in navigator)) return
    const onMessage = (event: MessageEvent) => {
      if (isOpenTaskMessage(event.data) && event.data.taskId) callback.current(event.data.taskId)
    }
    navigator.serviceWorker.addEventListener('message', onMessage)
    return () => navigator.serviceWorker.removeEventListener('message', onMessage)
  }, [])
}
