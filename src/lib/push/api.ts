/** Cliente del Worker de avisos. Errores explícitos: nada se traga en silencio. */

export interface PushSubscriptionData {
  endpoint: string
  keys: { p256dh: string; auth: string }
}

export interface EncryptedItem {
  id: string
  at: number
  payload: string
}

export interface DeviceCredentials {
  deviceId: string
  token: string
}

/** Fecha y hora locales del móvil, para que la IA resuelva "mañana" o "a las 5". */
export interface VoiceContext {
  today: string
  now: string
}

export interface Transcription {
  text: string
  tasks: unknown
}

export class PushApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message)
    this.name = 'PushApiError'
  }
}

export interface PushApi {
  vapidKey(): Promise<string>
  register(subscription: PushSubscriptionData): Promise<DeviceCredentials>
  /** Alta de la app nativa: solo dicta, sus avisos son notificaciones locales. */
  registerVoice(): Promise<DeviceCredentials>
  updateSubscription(token: string, subscription: PushSubscriptionData): Promise<void>
  /** `keepalive`: la petición sobrevive a que iOS congele la página al salir de la app. */
  putSchedule(token: string, items: readonly EncryptedItem[], options?: { keepalive?: boolean }): Promise<void>
  /**
   * WAV en base64 → texto transcrito y, si se manda el contexto, las tareas que la IA entiende.
   * `tasks` llega sin validar: ver `draftsFromInterpreted`. `signal` cancela la espera.
   */
  transcribe(
    token: string,
    audio: string,
    context?: VoiceContext,
    options?: { signal?: AbortSignal },
  ): Promise<Transcription>
  unregister(token: string): Promise<void>
}

const KEEPALIVE_MAX_CHARS = 60_000

type Fetch = (input: string, init?: RequestInit) => Promise<Response>

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null

function credentialsOf(data: unknown): DeviceCredentials {
  if (!isRecord(data) || typeof data.deviceId !== 'string' || typeof data.token !== 'string') {
    throw new PushApiError(500, 'Respuesta inesperada.')
  }
  return { deviceId: data.deviceId, token: data.token }
}

export function createPushApi(baseUrl: string, fetchImpl: Fetch = (input, init) => fetch(input, init)): PushApi {
  const base = baseUrl.replace(/\/+$/, '')

  async function call(
    method: string,
    path: string,
    options: { token?: string; body?: unknown; keepalive?: boolean; signal?: AbortSignal } = {},
  ): Promise<unknown> {
    const headers: Record<string, string> = {}
    if (options.token) headers.authorization = `Bearer ${options.token}`
    if (options.body !== undefined) headers['content-type'] = 'application/json'
    const body = options.body === undefined ? undefined : JSON.stringify(options.body)

    let response: Response
    try {
      response = await fetchImpl(`${base}${path}`, {
        method,
        headers,
        body,
        signal: options.signal,
        // Los navegadores rechazan `keepalive` con cuerpos de más de 64 KB.
        keepalive: Boolean(options.keepalive) && (body?.length ?? 0) < KEEPALIVE_MAX_CHARS,
      })
    } catch (error) {
      // Una cancelación pedida no es un fallo de red: quien la pidió decide qué enseñar.
      if (options.signal?.aborted) throw error
      throw new PushApiError(0, 'Sin conexión con el servidor de avisos.')
    }

    if (response.status === 204) return null
    const json: unknown = await response.json().catch(() => null)
    if (!response.ok) {
      const message = isRecord(json) && typeof json.error === 'string' ? json.error : `Error ${response.status}`
      throw new PushApiError(response.status, message)
    }
    return isRecord(json) ? json.data : null
  }

  return {
    async vapidKey() {
      const data = await call('GET', '/v1/vapid')
      if (!isRecord(data) || typeof data.publicKey !== 'string') throw new PushApiError(500, 'Respuesta inesperada.')
      return data.publicKey
    },
    async register(subscription) {
      return credentialsOf(await call('POST', '/v1/devices', { body: { subscription } }))
    },
    async registerVoice() {
      return credentialsOf(await call('POST', '/v1/devices', { body: { voice: true } }))
    },
    async updateSubscription(token, subscription) {
      await call('PUT', '/v1/devices/subscription', { token, body: { subscription } })
    },
    async putSchedule(token, items, options = {}) {
      await call('PUT', '/v1/schedule', { token, body: { items }, keepalive: options.keepalive })
    },
    async transcribe(token, audio, context, options = {}) {
      const data = await call('POST', '/v1/transcribe', { token, body: { audio, context }, signal: options.signal })
      if (!isRecord(data) || typeof data.text !== 'string') throw new PushApiError(500, 'Respuesta inesperada.')
      return { text: data.text, tasks: data.tasks ?? null }
    },
    async unregister(token) {
      await call('DELETE', '/v1/devices', { token })
    },
  }
}
