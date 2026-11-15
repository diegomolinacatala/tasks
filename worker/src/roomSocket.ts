import { HttpError } from './http'
import type { RoomCore } from './roomCore'
import { isSecret, parsePuts, parseSince } from './roomInput'
import { recsMessage } from './roomHttp'

/** Lo que guarda cada socket para sobrevivir a la hibernación: de qué miembro es (`null` hasta el `auth`). */
export interface SocketAttachment {
  member: string | null
}

export const CLOSE = {
  unauthorized: 4001,
  removed: 4003,
  missing: 4004,
  /** Un mensaje que no sigue el protocolo. */
  invalid: 1008,
} as const

/** Lo que el Durable Object pone a disposición de un mensaje: este socket y los demás de la sala. */
export interface SocketPort {
  send(message: string): void
  /** A los demás sockets ya autenticados de la sala. */
  broadcast(message: string): void
  close(code: number, reason: string): void
  attach(attachment: SocketAttachment): void
}

type Message = Record<string, unknown> & { t: string }

function parseMessage(raw: string | ArrayBuffer): Message | null {
  if (typeof raw !== 'string') return null
  try {
    const value: unknown = JSON.parse(raw)
    if (typeof value === 'object' && value !== null && typeof (value as { t?: unknown }).t === 'string') {
      return value as Message
    }
  } catch {
    // Cae al cierre por mensaje inválido.
  }
  return null
}

const send = (port: SocketPort, message: object) => port.send(JSON.stringify(message))

/** El `id` de un `put` vuelve tal cual en su `ack`: un número o un texto corto. */
const isPutId = (id: unknown): id is string | number =>
  (typeof id === 'string' && id.length <= 64) || (typeof id === 'number' && Number.isFinite(id))

/** Manda lo posterior a `since` en lotes y después `ready`. */
export function catchUp(core: RoomCore, since: number, port: SocketPort): void {
  let cursor = since
  let reset = false
  for (let first = true; ; first = false) {
    const page = core.read(cursor)
    if (first) reset = page.reset
    if (page.recs.length) port.send(recsMessage(page.recs, page.seq, page.more))
    cursor = page.seq
    if (!page.more) break
  }
  send(port, { t: 'ready', seq: cursor, ...(reset ? { reset: true } : {}) })
}

async function authenticate(core: RoomCore, message: Message, port: SocketPort, now: number): Promise<number | null> {
  const since = parseSince(message.since)
  if (!since.ok) {
    port.close(CLOSE.invalid, since.error)
    return null
  }
  try {
    const member = await core.authenticate(isSecret(message.token) ? message.token : null, now)
    port.attach({ member: member.id })
    const alarm = core.touch(now)
    catchUp(core, since.value, port)
    return alarm
  } catch (error) {
    if (!(error instanceof HttpError)) throw error
    port.close(error.status === 404 ? CLOSE.missing : CLOSE.unauthorized, error.message)
    return null
  }
}

function put(core: RoomCore, message: Message, port: SocketPort, now: number): number | null {
  const { id } = message
  if (!isPutId(id)) {
    port.close(CLOSE.invalid, 'put sin id')
    return null
  }
  const recs = parsePuts(message.recs)
  if (!recs.ok) {
    send(port, { t: 'error', id, status: 400, error: recs.error })
    return null
  }
  try {
    const alarm = core.touch(now)
    const written = core.write(recs.value, now)
    send(port, { t: 'ack', id, seq: written.seq })
    if (written.recs.length) port.broadcast(recsMessage(written.recs, written.seq))
    return alarm
  } catch (error) {
    if (!(error instanceof HttpError)) throw error
    send(port, { t: 'error', id, status: error.status, error: error.message })
    return null
  }
}

/**
 * Un mensaje de un socket. Lo primero tiene que ser `auth`; después, `put` y `ping`. Devuelve la hora a la que
 * reprogramar la alarma de la sala, o `null`.
 */
export async function handleSocketMessage(
  core: RoomCore,
  attachment: SocketAttachment,
  raw: string | ArrayBuffer,
  port: SocketPort,
  now: number,
): Promise<number | null> {
  const message = parseMessage(raw)
  if (!attachment.member) {
    if (message?.t === 'auth') return authenticate(core, message, port, now)
    port.close(CLOSE.unauthorized, 'lo primero es auth')
    return null
  }
  if (!core.exists()) {
    port.close(CLOSE.missing, 'la sala no existe')
    return null
  }
  if (!core.current(attachment.member)) {
    port.close(CLOSE.removed, 'ya no eres miembro')
    return null
  }
  switch (message?.t) {
    case 'ping':
      send(port, { t: 'pong' })
      return null
    case 'put':
      return put(core, message, port, now)
    case 'auth':
      // Ya autenticado: no cambia nada.
      return null
    default:
      port.close(CLOSE.invalid, 'mensaje desconocido')
      return null
  }
}
