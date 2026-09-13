/// <reference lib="webworker" />
import { clientsClaim } from 'workbox-core'
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching'
import { NavigationRoute, registerRoute } from 'workbox-routing'
import { decryptJson } from './lib/push/crypto'
import { loadContentKey } from './lib/push/keystore'
import type { NotificationContent, OpenTaskMessage } from './lib/push/message'
import { FALLBACK_CONTENT, parseContent, parsePushData } from './lib/push/message'

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
  await self.registration.showNotification(content.title, {
    body: content.body,
    data: { taskId: content.taskId },
    icon: `${BASE}icons/icon-192.png`,
  })
  await updateBadge(content.badge)
}

self.addEventListener('push', (event) => {
  event.waitUntil(showFromPush(event.data?.text() ?? ''))
})

async function openTask(taskId: string | null): Promise<void> {
  const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
  const client = windows[0]
  if (client) {
    await client.focus()
    const message: OpenTaskMessage = { type: 'open-task', taskId }
    client.postMessage(message)
    return
  }
  const url = new URL(BASE, self.location.origin)
  if (taskId) url.searchParams.set('task', taskId)
  await self.clients.openWindow(url.href)
}

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const data: unknown = event.notification.data
  const taskId =
    typeof data === 'object' && data !== null && typeof (data as { taskId?: unknown }).taskId === 'string'
      ? (data as { taskId: string }).taskId
      : null
  event.waitUntil(openTask(taskId))
})
