import { bearerToken } from './auth'
import { HttpError, empty, errorResponse, json, readJson, unwrap } from './http'
import type { RoomCore } from './roomCore'
import type { Member } from './roomStore'
import {
  MAX_PUTS,
  MAX_VALUE_CHARS,
  parseCreate,
  parseInvite,
  parseJoin,
  parsePuts,
  parseSince,
} from './roomInput'

/** Lo que entiende el Durable Object de una sala. `POST /v1/rooms/:room` (crearla) solo lo usa el Worker. */
export const ROOM_ROUTE = /^\/v1\/rooms\/([A-Za-z0-9_-]{22})(?:\/(invites|join|members|sync|socket)(?:\/([A-Za-z0-9_-]{1,32}))?)?$/
export const MAX_SMALL_BODY_BYTES = 4096
/** 500 registros de 16 KB con su envoltorio. */
export const MAX_SYNC_BODY_BYTES = MAX_PUTS * (MAX_VALUE_CHARS + 64) + MAX_SMALL_BODY_BYTES

export interface RoomOutcome {
  response: Response
  /** Miembro quitado: sus sockets se cierran con 4003. */
  kicked?: string
  /** Se fue el último: la sala ya no existe. */
  destroyed?: boolean
  /** Lo escrito, tal como se manda a los sockets de la sala. */
  broadcast?: string
  /** Reprogramar la alarma que borra la sala a esta hora. */
  alarm?: number
}

const ok = (data: unknown, status = 200) => json(status, { data })

export const recsMessage = (recs: unknown[], seq: number, more = false) =>
  JSON.stringify({ t: 'recs', recs, seq, ...(more ? { more: true } : {}) })

type Body = Record<string, unknown>

function sync(core: RoomCore, body: Body, now: number): RoomOutcome {
  const since = unwrap(parseSince(body.since))
  const puts = unwrap(parsePuts(body.put))
  // Se lee antes de escribir: lo que sube uno mismo no le vuelve en la respuesta.
  const page = core.read(since)
  const written = core.write(puts, now)
  const data = {
    seq: page.more ? page.seq : written.seq,
    recs: page.recs,
    ...(page.reset ? { reset: true } : {}),
    ...(page.more ? { more: true } : {}),
  }
  return {
    response: ok(data),
    ...(written.recs.length ? { broadcast: recsMessage(written.recs, written.seq) } : {}),
  }
}

async function route(core: RoomCore, request: Request, now: number): Promise<RoomOutcome> {
  const match = ROOM_ROUTE.exec(new URL(request.url).pathname)
  if (!match) throw new HttpError(404, 'no encontrado')
  const [, room, op, sub] = match
  const { method } = request
  // El cuerpo se lee siempre antes de responder: el Worker lo pasa como un flujo, y dejarlo a medias al
  // contestar un 401 o un 404 rompe la petición.
  const body: Body = method === 'POST' ? await readJson(request, op === 'sync' ? MAX_SYNC_BODY_BYTES : MAX_SMALL_BODY_BYTES) : {}

  if (!op && method === 'POST') {
    const input = unwrap(parseCreate(body))
    const created = await core.create(input, now)
    return { response: ok({ room, ...created }, 201), alarm: core.alarmAt() ?? undefined }
  }
  if (op === 'join' && method === 'POST' && !sub) {
    const input = unwrap(parseJoin(body))
    const joined = await core.join(input, now)
    return withAlarm(core, now, { response: ok(joined) })
  }
  if (op === 'socket') throw new HttpError(426, 'hace falta un WebSocket')

  const member = await core.authenticate(bearerToken(request), now)
  // La actividad se apunta antes: si toca podar, lo que se lee ya sale podado.
  const alarm = core.touch(now)
  const outcome = await authenticated(core, `${method} ${op ?? ''}${sub ? '/:id' : ''}`, body, now, member, sub)
  return alarm === null ? outcome : { ...outcome, alarm }
}

function withAlarm(core: RoomCore, now: number, outcome: RoomOutcome): RoomOutcome {
  const alarm = core.touch(now)
  return alarm === null ? outcome : { ...outcome, alarm }
}

async function authenticated(
  core: RoomCore,
  key: string,
  body: Body,
  now: number,
  member: Member,
  sub: string | undefined,
): Promise<RoomOutcome> {
  switch (key) {
    case 'POST invites': {
      const input = unwrap(parseInvite(body))
      return { response: ok(await core.createInvite(member, input, now)) }
    }
    case 'GET members':
      return { response: ok({ members: core.members(member) }) }
    case 'DELETE members/:id': {
      const removal = core.remove(member, sub ?? '')
      return { response: empty(), kicked: removal.kicked, ...(removal.destroyed ? { destroyed: true } : {}) }
    }
    case 'POST sync':
      return sync(core, body, now)
    default:
      throw new HttpError(404, 'no encontrado')
  }
}

/** Las rutas HTTP de una sala (todo menos el WebSocket, que acepta el propio Durable Object). */
export async function handleRoomHttp(core: RoomCore, request: Request, now: number): Promise<RoomOutcome> {
  try {
    return await route(core, request, now)
  } catch (error) {
    if (error instanceof HttpError) return { response: errorResponse(error) }
    throw error
  }
}
