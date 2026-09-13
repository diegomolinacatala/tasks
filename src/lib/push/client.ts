import type { DeviceCredentials, PushApi, PushSubscriptionData } from './api'
import { PushApiError } from './api'
import { fromBase64Url } from './crypto'
import { clearDevice, ensureContentKey, loadDevice, saveDevice } from './keystore'
import type { PushSupport } from './sync'
import { detectSupport, sameKey } from './sync'

const SW_READY_TIMEOUT_MS = 10_000

export function currentSupport(): PushSupport {
  const nav = navigator as Navigator & { standalone?: boolean }
  return detectSupport({
    userAgent: nav.userAgent,
    platform: nav.platform,
    maxTouchPoints: nav.maxTouchPoints,
    standalone: window.matchMedia('(display-mode: standalone)').matches || nav.standalone === true,
    hasPush: 'serviceWorker' in nav && 'PushManager' in window && 'Notification' in window,
  })
}

async function serviceWorker(): Promise<ServiceWorkerRegistration> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('El service worker no está activo.')), SW_READY_TIMEOUT_MS)
  })
  try {
    return await Promise.race([navigator.serviceWorker.ready, timeout])
  } finally {
    clearTimeout(timer)
  }
}

function toData(subscription: PushSubscription): PushSubscriptionData {
  const json = subscription.toJSON()
  const p256dh = json.keys?.p256dh
  const auth = json.keys?.auth
  if (!json.endpoint || !p256dh || !auth) throw new Error('La suscripción push está incompleta.')
  return { endpoint: json.endpoint, keys: { p256dh, auth } }
}

/** Suscripción vigente con la clave del servidor; si se creó con otra, se rehace. */
async function subscribe(api: PushApi): Promise<PushSubscriptionData> {
  const registration = await serviceWorker()
  const applicationServerKey = fromBase64Url(await api.vapidKey())
  const existing = await registration.pushManager.getSubscription()
  if (existing && sameKey(existing.options.applicationServerKey, applicationServerKey)) return toData(existing)
  await existing?.unsubscribe()
  return toData(await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey }))
}

/** Da de alta o actualiza este dispositivo en el servidor. */
async function upsertDevice(api: PushApi, subscription: PushSubscriptionData): Promise<DeviceCredentials> {
  const stored = await loadDevice()
  if (stored) {
    try {
      await api.updateSubscription(stored.token, subscription)
      return stored
    } catch (error) {
      // 401: el servidor olvidó este dispositivo; se registra de nuevo.
      if (!(error instanceof PushApiError && error.status === 401)) throw error
    }
  }
  const device = await api.register(subscription)
  await saveDevice(device)
  return device
}

/**
 * Pide permiso y activa los avisos. `Notification.requestPermission` debe ser lo primero:
 * iOS solo lo acepta dentro del gesto del usuario.
 */
export async function enablePush(api: PushApi): Promise<DeviceCredentials | null> {
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') return null
  await ensureContentKey()
  return upsertDevice(api, await subscribe(api))
}

/** Al abrir la app: si la suscripción rotó, se informa al servidor. */
export async function refreshPush(api: PushApi): Promise<DeviceCredentials | null> {
  const stored = await loadDevice()
  if (!stored || Notification.permission !== 'granted') return null
  return upsertDevice(api, await subscribe(api))
}

export async function disablePush(api: PushApi): Promise<void> {
  const stored = await loadDevice()
  if (stored) {
    try {
      await api.unregister(stored.token)
    } catch (error) {
      // Si el servidor ya no lo conoce, el objetivo está cumplido.
      if (!(error instanceof PushApiError && error.status === 401)) throw error
    }
  }
  const registration = await serviceWorker().catch(() => null)
  await (await registration?.pushManager.getSubscription())?.unsubscribe()
  await clearDevice()
}

export { loadDevice }
