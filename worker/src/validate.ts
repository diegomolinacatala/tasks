import type { InterpretContext, ScheduleItem, Subscription } from './types'

export type Result<T> = { ok: true; value: T } | { ok: false; error: string }

export const MAX_ITEMS = 200
export const MAX_PAYLOAD_CHARS = 2048
const MAX_ENDPOINT_CHARS = 1024
const MAX_HORIZON_MS = 400 * 24 * 60 * 60 * 1000

const BASE64URL = /^[A-Za-z0-9_-]+$/
const ITEM_ID = /^[A-Za-z0-9_-]{1,40}$/

/** Solo servicios push conocidos: el Worker nunca hace peticiones a hosts arbitrarios. */
const PUSH_HOSTS = ['web.push.apple.com', 'fcm.googleapis.com', 'updates.push.services.mozilla.com']
const PUSH_HOST_SUFFIXES = ['.notify.windows.com', '.push.apple.com']

const ok = <T>(value: T): Result<T> => ({ ok: true, value })
const fail = <T>(error: string): Result<T> => ({ ok: false, error })

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null

/** Apple responde 403 BadJwtToken si el subject no es un mailto: o https:// con dominio real. */
export function isValidVapidSubject(subject: string): boolean {
  const match = /^(?:mailto:[^@\s]+@([^\s>]+)|https:\/\/([^/\s:?#]+)\S*)$/.exec(subject.trim())
  const host = (match?.[1] ?? match?.[2] ?? '').toLowerCase()
  return host.includes('.') && host !== 'localhost' && !host.endsWith('.localhost')
}

export function isAllowedPushEndpoint(raw: string): boolean {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return false
  }
  if (url.protocol !== 'https:' || url.port !== '' || url.username || url.password) return false
  const host = url.hostname.toLowerCase()
  return PUSH_HOSTS.includes(host) || PUSH_HOST_SUFFIXES.some((suffix) => host.endsWith(suffix))
}

const isKey = (value: unknown, min: number, max: number): value is string =>
  typeof value === 'string' && value.length >= min && value.length <= max && BASE64URL.test(value)

export function parseSubscription(raw: unknown): Result<Subscription> {
  if (!isObject(raw)) return fail('subscription requerida')
  const { endpoint, keys } = raw
  if (typeof endpoint !== 'string' || endpoint.length > MAX_ENDPOINT_CHARS) return fail('endpoint inválido')
  if (!isAllowedPushEndpoint(endpoint)) return fail('servicio push no admitido')
  if (!isObject(keys)) return fail('keys requeridas')
  // p256dh: punto P-256 sin comprimir (65 bytes ≈ 87 chars). auth: 16 bytes ≈ 22 chars.
  if (!isKey(keys.p256dh, 80, 100)) return fail('p256dh inválida')
  if (!isKey(keys.auth, 16, 32)) return fail('auth inválida')
  return ok({ endpoint, keys: { p256dh: keys.p256dh, auth: keys.auth } })
}

export function parsePayload(raw: unknown): Result<string> {
  return isKey(raw, 1, MAX_PAYLOAD_CHARS) ? ok(raw) : fail('payload inválido')
}

/** WAV de 16 kHz mono: ~30 s caben en 1 MB, que en base64 son ~1,4 MB. */
export const MAX_AUDIO_CHARS = 2_000_000
const MIN_AUDIO_CHARS = 1000
const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/

export function parseAudio(raw: unknown): Result<string> {
  if (typeof raw !== 'string' || raw.length < MIN_AUDIO_CHARS) return fail('audio vacío')
  if (raw.length > MAX_AUDIO_CHARS) return fail('audio demasiado largo')
  return BASE64.test(raw) ? ok(raw) : fail('audio inválido')
}

/** Lo mismo que se guarda de una transcripción: más largo no es una tarea. */
const MAX_TEXT_CHARS = 500
/** Por encima de esto no es un dictado sino otra cosa: se rechaza sin llegar a la IA. */
const MAX_TEXT_INPUT_CHARS = 5000

/** Texto que Siri o un atajo ya transcribieron en el iPhone. */
export function parseInterpretText(raw: unknown): Result<string> {
  if (typeof raw !== 'string' || raw.length > MAX_TEXT_INPUT_CHARS) return fail('texto inválido')
  const text = raw.replace(/\s+/g, ' ').trim().slice(0, MAX_TEXT_CHARS)
  return text ? ok(text) : fail('texto vacío')
}

/** Contexto opcional para interpretar el dictado; si no es válido, se ignora. */
export function parseInterpretContext(raw: unknown): InterpretContext | null {
  if (!isObject(raw)) return null
  const { today, now } = raw
  if (typeof today !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(today) || Number.isNaN(Date.parse(today))) return null
  if (typeof now !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(now)) return null
  return { today, now }
}

export function parseSchedule(raw: unknown, now: number): Result<ScheduleItem[]> {
  if (!isObject(raw) || !Array.isArray(raw.items)) return fail('items requeridos')
  if (raw.items.length > MAX_ITEMS) return fail(`máximo ${MAX_ITEMS} avisos`)

  const seen = new Set<string>()
  const items: ScheduleItem[] = []
  for (const item of raw.items) {
    if (!isObject(item)) return fail('item inválido')
    const { id, at, payload } = item
    if (typeof id !== 'string' || !ITEM_ID.test(id) || seen.has(id)) return fail('id inválido o repetido')
    if (typeof at !== 'number' || !Number.isInteger(at) || at <= 0 || at > now + MAX_HORIZON_MS) {
      return fail('at inválido')
    }
    const parsed = parsePayload(payload)
    if (!parsed.ok) return fail(parsed.error)
    seen.add(id)
    items.push({ id, at, payload: parsed.value })
  }
  return ok(items)
}
