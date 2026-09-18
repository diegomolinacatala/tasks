import { bearerToken, randomToken, sha256Hex } from './auth'
import { isQuotaExceeded } from './transcribe'
import type { Deps, Device, InterpretContext, InterpretedTask } from './types'
import { MAX_AUDIO_CHARS, parseAudio, parseInterpretContext, parseInterpretText, parseSchedule, parseSubscription } from './validate'

export const MAX_BODY_BYTES = 512_000
const MAX_AUDIO_BODY_BYTES = MAX_AUDIO_CHARS + 1000
export const MAX_DEVICES_PER_IP_HOUR = 10
const HOUR_MS = 60 * 60 * 1000
/** Pasado este tiempo, el móvil interpreta el texto con su analizador local antes que esperar más. */
export const INTERPRET_TIMEOUT_MS = 8000

class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message)
  }
}

const tooLarge = () => new HttpError(413, 'cuerpo demasiado grande')
const tooMany = () => new HttpError(429, 'demasiadas peticiones, prueba más tarde')

function corsHeaders(request: Request, deps: Deps): Headers {
  const headers = new Headers({ vary: 'Origin' })
  const origin = request.headers.get('origin')
  if (origin && deps.config.allowedOrigins.includes(origin)) {
    headers.set('access-control-allow-origin', origin)
    headers.set('access-control-allow-methods', 'GET, POST, PUT, DELETE, OPTIONS')
    headers.set('access-control-allow-headers', 'authorization, content-type')
    headers.set('access-control-max-age', '86400')
  }
  return headers
}

const json = (status: number, body: unknown, headers: Headers) => {
  headers.set('content-type', 'application/json')
  return new Response(JSON.stringify(body), { status, headers })
}

const empty = (headers: Headers) => new Response(null, { status: 204, headers })

/** Lee el cuerpo cortando en cuanto supera el máximo: `content-length` puede faltar o mentir. */
async function readBody(request: Request, maxBytes: number): Promise<string> {
  if (Number(request.headers.get('content-length') ?? '0') > maxBytes) throw tooLarge()
  if (!request.body) return ''
  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.byteLength
    if (size > maxBytes) {
      await reader.cancel()
      throw tooLarge()
    }
    chunks.push(value)
  }
  const bytes = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  return new TextDecoder().decode(bytes)
}

async function readJson(request: Request, maxBytes = MAX_BODY_BYTES): Promise<Record<string, unknown>> {
  let parsed: unknown
  try {
    parsed = JSON.parse(await readBody(request, maxBytes))
  } catch (error) {
    if (error instanceof HttpError) throw error
    throw new HttpError(400, 'JSON inválido')
  }
  return typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, unknown>) : {}
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(Object.assign(new Error('tiempo agotado'), { name: 'TimeoutError' })), ms)
  })
  return Promise.race([promise, timeout]).finally(() => {
    if (timer !== undefined) clearTimeout(timer)
  })
}

function unwrap<T>(result: { ok: true; value: T } | { ok: false; error: string }): T {
  if (!result.ok) throw new HttpError(400, result.error)
  return result.value
}

async function authenticate(request: Request, deps: Deps): Promise<Device> {
  const token = bearerToken(request)
  const device = token ? await deps.store.findDevice(await sha256Hex(token)) : null
  if (!device) throw new HttpError(401, 'no autorizado')
  return device
}

/** `{ subscription }` para la PWA; `{ voice: true }` para la app nativa, que solo dicta. */
async function registerDevice(request: Request, deps: Deps, ipHash: string) {
  const body = await readJson(request)
  const subscription = body.voice === true ? null : unwrap(parseSubscription(body.subscription))
  const now = deps.now()
  if ((await deps.store.countDevicesSince(ipHash, now - HOUR_MS)) >= MAX_DEVICES_PER_IP_HOUR) throw tooMany()
  const token = randomToken()
  const deviceId = crypto.randomUUID()
  await deps.store.createDevice({ id: deviceId, tokenHash: await sha256Hex(token), subscription, ipHash, now })
  return { deviceId, token }
}

/** Tareas que entiende la IA, o `null` si falla o tarda: el móvil tira entonces de su analizador local. */
async function interpretOrNull(deps: Deps, text: string, context: InterpretContext): Promise<InterpretedTask[] | null> {
  try {
    return await withTimeout(deps.interpreter.interpret(text, context), INTERPRET_TIMEOUT_MS)
  } catch (error) {
    console.error('interpretación fallida', error instanceof Error ? error.name : 'desconocido')
    return null
  }
}

type Handler = (device: Device) => Promise<Response>

function deviceHandlers(request: Request, deps: Deps, headers: Headers): Record<string, Handler> {
  return {
    'PUT /v1/devices/subscription': async (device) => {
      const subscription = unwrap(parseSubscription((await readJson(request)).subscription))
      await deps.store.touchDevice(device.id, deps.now(), subscription)
      return empty(headers)
    },
    'PUT /v1/schedule': async (device) => {
      if (!device.subscription) throw new HttpError(409, 'dispositivo sin avisos push')
      const now = deps.now()
      const items = unwrap(parseSchedule(await readJson(request), now))
      await deps.store.replaceSchedule(device.id, items)
      const earliest = items.reduce<number | null>((min, item) => (min === null || item.at < min ? item.at : min), null)
      if (earliest !== null) await deps.scheduler.arm(earliest)
      await deps.store.touchDevice(device.id, now)
      return empty(headers)
    },
    'POST /v1/transcribe': async (device) => {
      if (!(await deps.limits.voice.allow(device.id))) throw tooMany()
      const body = await readJson(request, MAX_AUDIO_BODY_BYTES)
      const audio = unwrap(parseAudio(body.audio))
      const context = parseInterpretContext(body.context)
      // La app nativa solo aparece por aquí: sin esto caducaría a los 180 días aunque se use.
      await deps.store.touchDevice(device.id, deps.now())
      let text: string
      try {
        text = await deps.transcriber.transcribe(audio)
      } catch (error) {
        // El móvil distingue la cuota por el 503 para decir cuándo vuelve el dictado.
        if (isQuotaExceeded(error)) {
          console.error('transcripción fallida', 'cuota diaria agotada')
          throw new HttpError(503, 'cuota diaria de dictado agotada')
        }
        // Ni audio ni texto en los registros: solo que falló.
        console.error('transcripción fallida', error instanceof Error ? error.name : 'desconocido')
        throw new HttpError(502, 'no se pudo transcribir el audio')
      }
      // Sin contexto o si la IA falla, el móvil interpreta el texto con su analizador local.
      const tasks = context && text ? await interpretOrNull(deps, text, context) : null
      return json(200, { data: { text, tasks } }, headers)
    },
    // Siri o un atajo de la app de iPhone: el texto ya viene transcrito en el propio iPhone.
    'POST /v1/interpret': async (device) => {
      if (!(await deps.limits.voice.allow(device.id))) throw tooMany()
      const body = await readJson(request)
      const text = unwrap(parseInterpretText(body.text))
      const context = parseInterpretContext(body.context)
      if (!context) throw new HttpError(400, 'contexto requerido')
      await deps.store.touchDevice(device.id, deps.now())
      return json(200, { data: { tasks: await interpretOrNull(deps, text, context) } }, headers)
    },
    'DELETE /v1/devices': async (device) => {
      await deps.store.deleteDevice(device.id)
      return empty(headers)
    },
  }
}

async function route(request: Request, deps: Deps, headers: Headers): Promise<Response> {
  const key = `${request.method} ${new URL(request.url).pathname}`
  const ip = request.headers.get('cf-connecting-ip') ?? 'unknown'
  const ipHash = await sha256Hex(`${deps.config.ipSalt}:${ip}`)
  if (!(await deps.limits.ip.allow(ipHash))) throw tooMany()

  if (key === 'GET /v1/vapid') return json(200, { data: { publicKey: deps.config.vapidPublicKey } }, headers)
  if (key === 'POST /v1/devices') return json(201, { data: await registerDevice(request, deps, ipHash) }, headers)

  const handler = deviceHandlers(request, deps, headers)[key]
  if (!handler) throw new HttpError(404, 'no encontrado')
  const device = await authenticate(request, deps)
  if (!(await deps.limits.device.allow(device.id))) throw tooMany()
  return handler(device)
}

export async function handle(request: Request, deps: Deps): Promise<Response> {
  const headers = corsHeaders(request, deps)
  const origin = request.headers.get('origin')
  if (origin && !deps.config.allowedOrigins.includes(origin)) {
    return json(403, { error: 'origen no permitido' }, headers)
  }
  if (request.method === 'OPTIONS') return empty(headers)

  try {
    return await route(request, deps, headers)
  } catch (error) {
    if (error instanceof HttpError) return json(error.status, { error: error.message }, headers)
    // Sin detalles ni cuerpo de la petición: los registros no deben contener datos del usuario.
    console.error('Error interno', error instanceof Error ? error.name : 'desconocido')
    return json(500, { error: 'error interno' }, headers)
  }
}
