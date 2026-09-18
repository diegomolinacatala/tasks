import { LocalNotifications } from '@capacitor/local-notifications'
import type { NotificationEvent } from '../nativeEvents'
import { parseNotificationEvent } from '../nativeEvents'
import type { NativePlan } from '../nativeSchedule'
import { TASK_CATEGORY, isPlaceNotification } from '../nativeSchedule'
import type { PermissionStatus } from './native'
import { TasksNative } from './native'

const toStatus = (state: string): PermissionStatus => (state === 'granted' ? 'granted' : state === 'denied' ? 'denied' : 'prompt')

/**
 * Sin `sound`, el plugin programa los avisos de iOS en silencio. Un nombre que no es de ningún
 * fichero hace sonar el sonido del sistema (lo documenta el plugin); los de lugar usan el mismo.
 */
const SYSTEM_SOUND = 'default'

export async function notificationPermission(): Promise<PermissionStatus> {
  return toStatus((await LocalNotifications.checkPermissions()).display)
}

export async function requestNotificationPermission(): Promise<PermissionStatus> {
  return toStatus((await LocalNotifications.requestPermissions()).display)
}

let actionsRegistered = false

/**
 * Botones "Hecha" y "+10 min". Abren la app (`foreground`): el estado vive en la web y con la
 * app en segundo plano iOS no garantiza que el WebView llegue a ejecutar nada.
 */
async function registerTaskActions(): Promise<void> {
  if (actionsRegistered) return
  await LocalNotifications.registerActionTypes({
    types: [
      {
        id: TASK_CATEGORY,
        actions: [
          { id: 'done', title: 'Hecha', foreground: true },
          { id: 'snooze', title: '+10 min', foreground: true },
        ],
      },
    ],
  })
  actionsRegistered = true
}

/**
 * Deja programado exactamente el plan: cancela los avisos por hora que sobran, sincroniza las
 * regiones y reprograma el resto (mismo id = sustituye). Primero se libera hueco: iOS descarta
 * en silencio lo que pase de 64 pendientes.
 */
export async function applyPlan(plan: NativePlan): Promise<void> {
  await registerTaskActions()
  const { notifications: pending } = await LocalNotifications.getPending()
  const wanted = new Set(plan.timed.map((notification) => notification.id))
  const stale = pending.filter((notification) => !isPlaceNotification(notification.id) && !wanted.has(notification.id))
  if (stale.length) await LocalNotifications.cancel({ notifications: stale.map(({ id }) => ({ id })) })

  await TasksNative.syncPlaceAlerts({ alerts: plan.places })

  if (!plan.timed.length) return
  await LocalNotifications.schedule({
    notifications: plan.timed.map((notification) => ({
      id: notification.id,
      title: notification.title,
      body: notification.body,
      schedule: { at: new Date(notification.at), allowWhileIdle: true },
      sound: SYSTEM_SOUND,
      extra: notification.extra,
      actionTypeId: notification.category,
      threadIdentifier: notification.extra.taskId ? 'tasks' : 'tasks-digest',
    })),
  })
}

/** Toques en avisos. Con la app cerrada, el plugin guarda el evento hasta que alguien escucha. */
export function onNotificationEvent(listener: (event: NotificationEvent) => void): () => void {
  const handle = LocalNotifications.addListener('localNotificationActionPerformed', (performed) => {
    const event = parseNotificationEvent(performed.actionId, performed.notification.extra)
    if (event) listener(event)
  })
  return () => void handle.then((registered) => registered.remove())
}
