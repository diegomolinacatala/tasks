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
  updateSubscription(token: string, subscription: PushSubscriptionData): Promise<void>
  putSchedule(token: string, items: readonly EncryptedItem[]): Promise<void>
  test(token: string, payload: string): Promise<void>
  unregister(token: string): Promise<void>
}

type Fetch = (input: string, init?: RequestInit) => Promise<Response>

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null

export function createPushApi(baseUrl: string, fetchImpl: Fetch = (input, init) => fetch(input, init)): PushApi {
  const base = baseUrl.replace(/\/+$/, '')

  async function call(method: string, path: string, options: { token?: string; body?: unknown } = {}): Promise<unknown> {
    const headers: Record<string, string> = {}
    if (options.token) headers.authorization = `Bearer ${options.token}`
    if (options.body !== undefined) headers['content-type'] = 'application/json'

    let response: Response
    try {
      response = await fetchImpl(`${base}${path}`, {
        method,
        headers,
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
      })
    } catch {
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
      const data = await call('POST', '/v1/devices', { body: { subscription } })
      if (!isRecord(data) || typeof data.deviceId !== 'string' || typeof data.token !== 'string') {
        throw new PushApiError(500, 'Respuesta inesperada.')
      }
      return { deviceId: data.deviceId, token: data.token }
    },
    async updateSubscription(token, subscription) {
      await call('PUT', '/v1/devices/subscription', { token, body: { subscription } })
    },
    async putSchedule(token, items) {
      await call('PUT', '/v1/schedule', { token, body: { items } })
    },
    async test(token, payload) {
      await call('POST', '/v1/test', { token, body: { payload } })
    },
    async unregister(token) {
      await call('DELETE', '/v1/devices', { token })
    },
  }
}
