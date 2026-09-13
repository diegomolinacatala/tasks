import type { ScheduleEntry } from '../schedule'
import type { EncryptedItem } from './api'
import { encryptJson } from './crypto'
import { contentOf } from './message'

/**
 * Huella de lo que se va a subir. El cifrado usa IV aleatorio, así que se compara el
 * contenido en claro para no repetir subidas idénticas.
 */
export async function scheduleFingerprint(deviceId: string, entries: readonly ScheduleEntry[]): Promise<string> {
  const canonical = JSON.stringify([deviceId, entries.map((e) => [e.id, e.taskId, e.at, e.title, e.body, e.badge])])
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonical))
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

export function encryptSchedule(key: CryptoKey, entries: readonly ScheduleEntry[]): Promise<EncryptedItem[]> {
  return Promise.all(
    entries.map(async (entry) => ({
      id: entry.id,
      at: entry.at,
      payload: await encryptJson(
        key,
        contentOf({ taskId: entry.taskId, title: entry.title, body: entry.body, badge: entry.badge, at: entry.at }),
      ),
    })),
  )
}

export interface InstallEnvironment {
  userAgent: string
  platform: string
  maxTouchPoints: number
  standalone: boolean
  hasPush: boolean
}

export type PushSupport = 'ready' | 'needs-install' | 'unsupported'

/** En iPhone y iPad el push solo existe con la web instalada en la pantalla de inicio. */
export function detectSupport(env: InstallEnvironment): PushSupport {
  const ios = /iPad|iPhone|iPod/.test(env.userAgent) || (env.platform === 'MacIntel' && env.maxTouchPoints > 1)
  if (ios && !env.standalone) return 'needs-install'
  return env.hasPush ? 'ready' : 'unsupported'
}

/** Compara la clave VAPID con la que se creó una suscripción existente. */
export function sameKey(current: ArrayBuffer | null | undefined, expected: Uint8Array): boolean {
  if (!current) return false
  const bytes = new Uint8Array(current)
  return bytes.length === expected.length && bytes.every((byte, index) => byte === expected[index])
}
