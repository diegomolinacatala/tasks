import { HttpError, empty, errorResponse, json, readJson } from './http'

/**
 * Emparejar un dispositivo nuevo: deja su clave pública, el que ya está vinculado responde con la suya y una
 * caja cifrada, y el nuevo la recoge. El servidor no puede abrir la caja (ECDH entre los dos móviles).
 */

export const PAIR_TTL_MS = 10 * 60 * 1000
export const PAIR_ROUTE = /^\/v1\/pair\/([A-Za-z0-9_-]{22})$/
export const MAX_PUB_CHARS = 200
export const MAX_BOX_CHARS = 4000
export const MAX_PAIR_BODY_BYTES = 8192

const BASE64URL = /^[A-Za-z0-9_-]+$/

export interface PairReply {
  pub: string
  box: string
}

export interface PairState {
  pub: string
  created: number
  reply: PairReply | null
}

export interface PairStore {
  get(): Promise<PairState | null>
  put(state: PairState): Promise<void>
}

export interface PairOutcome {
  response: Response
  /** Programar la alarma que lo borra a esta hora. */
  alarm?: number
}

export function memoryPairStore(): PairStore & { state: () => PairState | null } {
  let state: PairState | null = null
  return {
    get: async () => state,
    put: async (next) => void (state = next),
    state: () => state,
  }
}

const isText = (value: unknown, max: number): value is string =>
  typeof value === 'string' && value.length <= max && BASE64URL.test(value)

const isAlive = (state: PairState | null, now: number): state is PairState =>
  state !== null && now < state.created + PAIR_TTL_MS

async function route(store: PairStore, request: Request, now: number): Promise<PairOutcome> {
  const match = PAIR_ROUTE.exec(new URL(request.url).pathname)
  if (!match) throw new HttpError(404, 'no encontrado')
  const [, id] = match
  // El cuerpo se lee antes de responder nada: el Worker lo pasa como un flujo.
  const hasBody = request.method === 'POST' || request.method === 'PUT'
  const body = hasBody ? await readJson(request, MAX_PAIR_BODY_BYTES) : {}
  const current = await store.get()

  if (request.method === 'POST') {
    const { pub } = body
    if (!isText(pub, MAX_PUB_CHARS)) throw new HttpError(400, 'clave pública inválida')
    if (isAlive(current, now)) throw new HttpError(409, 'ya existe')
    await store.put({ pub, created: now, reply: null })
    return { response: json(201, { data: { id } }), alarm: now + PAIR_TTL_MS }
  }
  if (!isAlive(current, now)) throw new HttpError(404, 'no existe o ha caducado')
  if (request.method === 'GET') {
    const headers = new Headers({ 'cache-control': 'no-store' })
    return { response: json(200, { data: { pub: current.pub, reply: current.reply } }, headers) }
  }
  if (request.method === 'PUT') {
    const { pub, box } = body
    if (!isText(pub, MAX_PUB_CHARS)) throw new HttpError(400, 'clave pública inválida')
    if (!isText(box, MAX_BOX_CHARS)) throw new HttpError(400, 'caja inválida')
    if (current.reply) throw new HttpError(409, 'ya se respondió')
    await store.put({ ...current, reply: { pub, box } })
    return { response: empty() }
  }
  throw new HttpError(405, 'método no permitido')
}

/** Las rutas de un emparejamiento. `POST /v1/pair/:id` (crearlo) solo lo usa el Worker, que elige el id. */
export async function handlePairHttp(store: PairStore, request: Request, now: number): Promise<PairOutcome> {
  try {
    return await route(store, request, now)
  } catch (error) {
    if (error instanceof HttpError) return { response: errorResponse(error) }
    throw error
  }
}
