/// <reference lib="webworker" />
import { clientsClaim } from 'workbox-core'
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching'
import { NavigationRoute, registerRoute } from 'workbox-routing'
import { decryptJson } from './lib/push/crypto'
import { loadContentKey } from './lib/push/keystore'
import type { NotificationAction, NotificationContent, OpenTaskMessage } from './lib/push/message'
import { FALLBACK_CONTENT, isNotificationAction, parseContent, parsePushData } from './lib/push/message'

declare const self: ServiceWorkerGlobalScope

const BASE = import.meta.env.BASE_URL

// Equivale al `registerType: 'autoUpdate'` de antes: la versión nueva entra sin esperar.
self.skipWaiting()
clientsClaim()

precacheAndRoute(self.__WB_MANIFEST)
cleanupOutdatedCaches()
registerRoute(new NavigationRoute(createHandlerBoundToURL(`${BASE}index.html`)))

async function readContent(text: string): Promise<NotificationContent> {
  try {
    const payload = parsePushData(text)
    const key = await loadContentKey()
    if (!payload || !key) return FALLBACK_CONTENT
    return parseContent(await decryptJson(key, payload)) ?? FALLBACK_CONTENT
  } catch {
    // iOS retira el permiso si un push no muestra nada: siempre se enseña algo.
    return FALLBACK_CONTENT
  }
}

async function updateBadge(count: number | null): Promise<void> {
  if (count === null || !('setAppBadge' in self.navigator)) return
  try {
    await self.navigator.setAppBadge(count)
  } catch {
    // El número del icono es accesorio: nunca debe impedir la notificación.
  }
}

async function showFromPush(text: string): Promise<void> {
  const content = await readContent(text)
  // Primero la notificación: iOS retira el permiso si un push no muestra nada.
  // `actions` y `timestamp` no están en los tipos de TS pero sí en los navegadores que los admiten.
  const options: NotificationOptions & { actions?: { action: NotificationAction; title: string }[]; timestamp?: number } = {
    body: content.body,
    data: { taskId: content.taskId },
    icon: `${BASE}icons/icon-192.png`,
    ...(content.at ? { timestamp: content.at } : {}),
    ...(content.taskId ? { actions: TASK_ACTIONS } : {}),
  }
  await self.registration.showNotification(content.title, options)
  await updateBadge(content.badge)
}

self.addEventListener('push', (event) => {
  event.waitUntil(showFromPush(event.data?.text() ?? ''))
})

const TASK_ACTIONS: { action: NotificationAction; title: string }[] = [
  { action: 'done', title: 'Hecha' },
  { action: 'snooze', title: '+10 min' },
]

/** La app aplica la acción: el estado de las tareas solo vive en la página. */
async function openTask(taskId: string | null, action: NotificationAction | null): Promise<void> {
  const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
  const client = windows[0]
  if (client) {
    await client.focus()
    const message: OpenTaskMessage = { type: 'open-task', taskId, action }
    client.postMessage(message)
    return
  }
  const url = new URL(BASE, self.location.origin)
  if (taskId) url.searchParams.set('task', taskId)
  if (taskId && action) url.searchParams.set('action', action)
  await self.clients.openWindow(url.href)
}

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const data: unknown = event.notification.data
  const taskId =
    typeof data === 'object' && data !== null && typeof (data as { taskId?: unknown }).taskId === 'string'
      ? (data as { taskId: string }).taskId
      : null
  event.waitUntil(openTask(taskId, isNotificationAction(event.action) ? event.action : null))
})
