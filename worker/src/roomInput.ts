import type { RoomKind } from './roomStore'

/** Lo que llega del móvil a una sala, validado. Nada de esto se puede leer: va cifrado o es una huella. */

export const ID_PATTERN = /^[A-Za-z0-9_-]{22}$/
const KEY = ID_PATTERN
const BASE64URL = /^[A-Za-z0-9_-]+$/
const SECRET = /^[A-Za-z0-9_-]{20,100}$/

export const MAX_VALUE_CHARS = 16 * 1024
export const MAX_PUTS = 500
export const MAX_NAME_CHARS = 400
export const MIN_INVITE_TTL_S = 60
export const MAX_INVITE_TTL_S = 7 * 24 * 60 * 60
export const MAX_INVITE_USES = 50

type Result<T> = { ok: true; value: T } | { ok: false; error: string }

const ok = <T>(value: T): Result<T> => ({ ok: true, value })
const fail = <T>(error: string): Result<T> => ({ ok: false, error })

export interface RecordInput {
  k: string
  v: string
  d: 0 | 1
}

export interface CreateInput {
  kind: RoomKind
  name: string
}

export interface InviteInput {
  /** Segundos. */
  ttl: number
  uses: number
}

export interface JoinInput {
  invite: string
  name: string
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const intIn = (value: unknown, min: number, max: number): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max

/** El nombre del miembro, cifrado en el móvil (base64url). */
const isName = (value: unknown): value is string =>
  typeof value === 'string' && value.length <= MAX_NAME_CHARS && BASE64URL.test(value)

export function parseCreate(body: unknown): Result<CreateInput> {
  if (!isObject(body)) return fail('cuerpo inválido')
  const { kind, name } = body
  if (kind !== 'personal' && kind !== 'basket') return fail('tipo de sala inválido')
  if (!isName(name)) return fail('nombre inválido')
  return ok({ kind, name })
}

export function parseInvite(body: unknown): Result<InviteInput> {
  if (!isObject(body)) return fail('cuerpo inválido')
  const { ttl, uses } = body
  if (!intIn(ttl, MIN_INVITE_TTL_S, MAX_INVITE_TTL_S)) return fail('ttl inválido')
  if (!intIn(uses, 1, MAX_INVITE_USES)) return fail('uses inválido')
  return ok({ ttl, uses })
}

export function parseJoin(body: unknown): Result<JoinInput> {
  if (!isObject(body)) return fail('cuerpo inválido')
  const { invite, name } = body
  if (typeof invite !== 'string' || !SECRET.test(invite)) return fail('invitación inválida')
  if (!isName(name)) return fail('nombre inválido')
  return ok({ invite, name })
}

/** Sin `since` es desde el principio. */
export function parseSince(value: unknown): Result<number> {
  if (value === undefined) return ok(0)
  return intIn(value, 0, Number.MAX_SAFE_INTEGER) ? ok(value) : fail('since inválido')
}

function parseRecord(value: unknown): RecordInput | null {
  if (!isObject(value)) return null
  const { k, v, d } = value
  if (typeof k !== 'string' || !KEY.test(k)) return null
  if (typeof v !== 'string' || v.length > MAX_VALUE_CHARS || !BASE64URL.test(v)) return null
  if (d !== 0 && d !== 1) return null
  return { k, v, d }
}

export function parsePuts(value: unknown): Result<RecordInput[]> {
  if (value === undefined) return ok([])
  if (!Array.isArray(value)) return fail('put inválido')
  if (value.length > MAX_PUTS) return fail(`como mucho ${MAX_PUTS} registros por envío`)
  const recs: RecordInput[] = []
  for (const item of value) {
    const rec = parseRecord(item)
    if (!rec) return fail('registro inválido')
    recs.push(rec)
  }
  return ok(recs)
}

export const isSecret = (value: unknown): value is string => typeof value === 'string' && SECRET.test(value)
