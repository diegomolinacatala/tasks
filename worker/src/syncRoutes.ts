import { randomId } from './auth'
import { HttpError, readBody, tooMany } from './http'
import { MAX_PAIR_BODY_BYTES } from './pairCore'
import { MAX_SMALL_BODY_BYTES } from './roomHttp'
import type { Deps } from './types'

/**
 * Salas y emparejamientos: el Worker valida la ruta, limita y reenvía al Durable Object que toca. Lo que
 * guardan lo deciden ellos (`room.ts`, `pair.ts`).
 */

const ROOM_PATH = /^\/v1\/rooms\/([A-Za-z0-9_-]{22})\/(invites|join|members|sync|socket)(?:\/([A-Za-z0-9_-]{8}))?$/
const PAIR_PATH = /^\/v1\/pair\/([A-Za-z0-9_-]{22})$/

/** Método de cada ruta de una sala; `members/:id` es la única con id. */
const ROOM_METHODS: Record<string, string> = {
  invites: 'POST',
  join: 'POST',
  members: 'GET',
  'members/:id': 'DELETE',
  sync: 'POST',
  socket: 'GET',
}

/** La respuesta del Durable Object con las cabeceras CORS del Worker. */
function withCors(response: Response, cors: Headers): Response {
  const headers = new Headers(cors)
  response.headers.forEach((value, key) => headers.set(key, value))
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers })
}

async function limitCreation(deps: Deps, ipHash: string): Promise<void> {
  if (!(await deps.limits.room.allow(ipHash))) throw tooMany()
}

/** Reenvía a un id que elige el Worker, con el cuerpo ya leído (y cortado). */
async function createAt(request: Request, path: string, maxBytes: number): Promise<Request> {
  const body = await readBody(request, maxBytes)
  return new Request(new URL(path, request.url), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body,
  })
}

async function roomRoute(request: Request, deps: Deps, ipHash: string, cors: Headers, pathname: string) {
  if (pathname === '/v1/rooms') {
    if (request.method !== 'POST') return null
    await limitCreation(deps, ipHash)
    const room = randomId()
    const forwarded = await createAt(request, `/v1/rooms/${room}`, MAX_SMALL_BODY_BYTES)
    return withCors(await deps.rooms.fetch(room, forwarded), cors)
  }
  const match = ROOM_PATH.exec(pathname)
  if (!match) return null
  const [, room = '', op = '', id] = match
  if (ROOM_METHODS[id ? `${op}/:id` : op] !== request.method) return null
  if (op === 'join') await limitCreation(deps, ipHash)
  if (op === 'socket') {
    if (request.headers.get('upgrade')?.toLowerCase() !== 'websocket') throw new HttpError(426, 'hace falta un WebSocket')
    // La subida a WebSocket pasa tal cual: la respuesta 101 no admite otras cabeceras.
    return deps.rooms.fetch(room, request)
  }
  return withCors(await deps.rooms.fetch(room, request), cors)
}

async function pairRoute(request: Request, deps: Deps, ipHash: string, cors: Headers, pathname: string) {
  if (pathname === '/v1/pair') {
    if (request.method !== 'POST') return null
    await limitCreation(deps, ipHash)
    const id = randomId()
    const forwarded = await createAt(request, `/v1/pair/${id}`, MAX_PAIR_BODY_BYTES)
    return withCors(await deps.pairs.fetch(id, forwarded), cors)
  }
  const match = PAIR_PATH.exec(pathname)
  if (!match || (request.method !== 'GET' && request.method !== 'PUT')) return null
  return withCors(await deps.pairs.fetch(match[1] ?? '', request), cors)
}

/** `null` si la ruta no es de sincronización. */
export async function syncRoute(request: Request, deps: Deps, ipHash: string, cors: Headers): Promise<Response | null> {
  const { pathname } = new URL(request.url)
  if (pathname.startsWith('/v1/rooms')) return roomRoute(request, deps, ipHash, cors, pathname)
  if (pathname.startsWith('/v1/pair')) return pairRoute(request, deps, ipHash, cors, pathname)
  return null
}
