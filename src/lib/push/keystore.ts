import { del, get, set } from 'idb-keyval'
import type { DeviceCredentials } from './api'
import { createContentKey } from './crypto'

// IndexedDB es compartido entre la página y el service worker (mismo origen).
const KEY_CONTENT = 'tasks:push:key'
const KEY_DEVICE = 'tasks:push:device'

export function loadContentKey(): Promise<CryptoKey | undefined> {
  return get<CryptoKey>(KEY_CONTENT)
}

/** La clave se crea una vez por dispositivo y se reutiliza. */
export async function ensureContentKey(): Promise<CryptoKey> {
  const existing = await loadContentKey()
  if (existing) return existing
  const key = await createContentKey()
  await set(KEY_CONTENT, key)
  return key
}

export async function loadDevice(): Promise<DeviceCredentials | null> {
  const stored = await get<unknown>(KEY_DEVICE)
  if (typeof stored !== 'object' || stored === null) return null
  const { deviceId, token } = stored as Record<string, unknown>
  return typeof deviceId === 'string' && typeof token === 'string' ? { deviceId, token } : null
}

export const saveDevice = (device: DeviceCredentials): Promise<void> => set(KEY_DEVICE, device)

export const clearDevice = (): Promise<void> => del(KEY_DEVICE)
