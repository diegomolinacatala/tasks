/** Las llamadas HTTP a las salas y al emparejamiento (`docs/sincronizacion.md`). */

export type RoomKind = 'personal' | 'basket'

export interface Member {
  id: string
  role: 'owner' | 'member'
  /** Cifrado con la clave de la sala. */
  name: string
  created: number
  seen: number
  you: boolean
}

export class SyncHttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message)
  }
}

const TIMEOUT_MS = 15_000

async function call<T>(base: string, path: string, init: { method: string; token?: string; body?: unknown }): Promise<T> {
  const headers: Record<string, string> = {}
  if (init.body !== undefined) headers['content-type'] = 'application/json'
  if (init.token) headers.authorization = `Bearer ${init.token}`
  const response = await fetch(`${base}${path}`, {
    method: init.method,
    headers,
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  })
  if (response.status === 204) return undefined as T
  const json = (await response.json().catch(() => ({}))) as { data?: T; error?: string }
  if (!response.ok) throw new SyncHttpError(response.status, json.error ?? `HTTP ${response.status}`)
  return json.data as T
}

export interface Joined {
  room: string
  member: string
  token: string
}

export const createRoom = (base: string, kind: RoomKind, name: string) =>
  call<Joined>(base, '/v1/rooms', { method: 'POST', body: { kind, name } })

export const createInvite = (base: string, room: string, token: string, ttl: number, uses: number) =>
  call<{ invite: string }>(base, `/v1/rooms/${room}/invites`, { method: 'POST', token, body: { ttl, uses } }).then((data) => data.invite)

export const joinRoom = (base: string, room: string, invite: string, name: string) =>
  call<{ member: string; token: string; kind: RoomKind }>(base, `/v1/rooms/${room}/join`, { method: 'POST', body: { invite, name } })

export const listMembers = (base: string, room: string, token: string) =>
  call<{ members: Member[] }>(base, `/v1/rooms/${room}/members`, { method: 'GET', token }).then((data) => data.members)

export const removeMember = (base: string, room: string, token: string, member: string) =>
  call<void>(base, `/v1/rooms/${room}/members/${member}`, { method: 'DELETE', token })

export const startPairing = (base: string, pub: string) =>
  call<{ id: string }>(base, '/v1/pair', { method: 'POST', body: { pub } }).then((data) => data.id)

export interface PairState {
  pub: string
  reply: { pub: string; box: string } | null
}

export const readPairing = (base: string, id: string) => call<PairState>(base, `/v1/pair/${id}`, { method: 'GET' })

export const answerPairing = (base: string, id: string, pub: string, box: string) =>
  call<void>(base, `/v1/pair/${id}`, { method: 'PUT', body: { pub, box } })

/** La dirección del socket de una sala, desde la del servidor (`https` → `wss`). */
export const socketUrl = (base: string, room: string): string => `${base.replace(/^http/, 'ws')}/v1/rooms/${room}/socket`
