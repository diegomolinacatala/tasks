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
  const actions = actionsFor(content)
  // Primero la notificación: iOS retira el permiso si un push no muestra nada.
  // `actions` y `timestamp` no están en los tipos de TS pero sí en los navegadores que los admiten.
  const options: NotificationOptions & { actions?: { action: NotificationAction; title: string }[]; timestamp?: number } = {
    body: content.body,
    data: { taskId: content.taskId },
    icon: `${BASE}icons/icon-192.png`,
    ...(content.at ? { timestamp: content.at } : {}),
    ...(actions.length ? { actions } : {}),
  }
  await self.registration.showNotification(content.title, options)
  await updateBadge(content.badge)
}

self.addEventListener('push', (event) => {
  event.waitUntil(showFromPush(event.data?.text() ?? ''))
})

type Button = { action: NotificationAction; title: string }

const DONE: Button = { action: 'done', title: 'Hecha' }
const SNOOZE: Button = { action: 'snooze', title: '+10 min' }

/**
 * Tarea: "Hecha" y "+10 min", y "Pasar a hoy" si ya es de un día anterior (delante de posponer:
 * donde solo caben dos, manda). Resumen diario con algo atrasado: pasarlo todo a hoy.
 */
function actionsFor(content: NotificationContent): Button[] {
  if (content.taskId) return content.overdue ? [DONE, { action: 'today', title: 'Pasar a hoy' }, SNOOZE] : [DONE, SNOOZE]
  return content.overdue ? [{ action: 'today', title: 'Pasar atrasadas a hoy' }] : []
}

/** La app aplica la acción: el estado de las tareas solo vive en la página. */
async function openTask(taskId: string | null, action: NotificationAction | null): Promise<void> {
  const scope = new URL(BASE, self.location.origin).href
  const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
  // La ventana de la app, no otra pestaña del mismo origen; mejor la que ya está a la vista.
  const inScope = windows.filter((item) => item.url.startsWith(scope))
  const client = inScope.find((item) => item.focused) ?? inScope[0]
  if (client) {
    const message: OpenTaskMessage = { type: 'open-task', taskId, action }
    // El mensaje sale aunque el sistema no deje enfocar: la acción no puede perderse por eso.
    client.postMessage(message)
    await client.focus().catch(() => undefined)
    return
  }
  const url = new URL(scope)
  if (taskId) url.searchParams.set('task', taskId)
  // Sin tarea, solo "Pasar a hoy" del resumen diario tiene sentido.
  if (action && (taskId || action === 'today')) url.searchParams.set('action', action)
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
