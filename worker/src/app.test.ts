import { describe, expect, test, vi } from 'vitest'
import { INTERPRET_TIMEOUT_MS, MAX_DEVICES_PER_IP_HOUR, handle } from './app'
import { sha256Hex } from './auth'
import { countingLimiter, subscription, testDeps } from './testing'
import type { Deps } from './types'

const ORIGIN = 'https://diegomolinacatala.github.io'
const API = 'https://tasks-push.example.workers.dev'
const AUDIO = 'UklGR'.padEnd(1200, 'A')

interface RequestOptions {
  body?: unknown
  token?: string
  origin?: string | null
  ip?: string
}

function request(method: string, path: string, { body, token, origin = ORIGIN, ip = '1.2.3.4' }: RequestOptions = {}) {
  const headers = new Headers({ 'cf-connecting-ip': ip })
  if (origin) headers.set('origin', origin)
  if (token) headers.set('authorization', `Bearer ${token}`)
  if (body !== undefined) headers.set('content-type', 'application/json')
  const payload = body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body)
  return new Request(`${API}${path}`, { method, headers, body: payload })
}

async function register(deps: Deps, ip?: string) {
  const response = await handle(request('POST', '/v1/devices', { body: { subscription: subscription() }, ip }), deps)
  const json = (await response.json()) as { data?: { deviceId: string; token: string } }
  return { response, deviceId: json.data?.deviceId ?? '', token: json.data?.token ?? '' }
}

describe('CORS y rutas públicas', () => {
  test('responde al preflight del origen permitido', async () => {
    const { deps } = testDeps()
    const response = await handle(request('OPTIONS', '/v1/schedule'), deps)
    expect(response.status).toBe(204)
    expect(response.headers.get('access-control-allow-origin')).toBe(ORIGIN)
    expect(response.headers.get('access-control-allow-headers')).toContain('authorization')
  })

  test('rechaza orígenes desconocidos', async () => {
    const { deps } = testDeps()
    const response = await handle(request('GET', '/v1/vapid', { origin: 'https://evil.com' }), deps)
    expect(response.status).toBe(403)
    expect(response.headers.get('access-control-allow-origin')).toBeNull()
  })

  test('publica la clave VAPID', async () => {
    const { deps } = testDeps()
    const response = await handle(request('GET', '/v1/vapid'), deps)
    expect(await response.json()).toEqual({ data: { publicKey: 'PUBLIC' } })
  })

  test('404 para rutas desconocidas', async () => {
    const { deps } = testDeps()
    expect((await handle(request('GET', '/nada'), deps)).status).toBe(404)
  })
})

describe('POST /v1/devices', () => {
  test('crea el dispositivo y guarda solo el hash del token', async () => {
    const { deps, memory } = testDeps()
    const { response, deviceId, token } = await register(deps)
    expect(response.status).toBe(201)
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/)
    const stored = memory.devices.get(deviceId)!
    expect(stored.tokenHash).toBe(await sha256Hex(token))
    expect(JSON.stringify(stored)).not.toContain(token)
    expect(stored.ipHash).not.toContain('1.2.3.4')
  })

  test('valida la suscripción', async () => {
    const { deps } = testDeps()
    const bad = { subscription: { ...subscription(), endpoint: 'https://evil.com/x' } }
    expect((await handle(request('POST', '/v1/devices', { body: bad }), deps)).status).toBe(400)
  })

  test('rechaza JSON inválido y cuerpos enormes', async () => {
    const { deps } = testDeps()
    expect((await handle(request('POST', '/v1/devices', { body: '{roto' }), deps)).status).toBe(400)
    const huge = { subscription: subscription(), pad: 'x'.repeat(600_000) }
    expect((await handle(request('POST', '/v1/devices', { body: huge }), deps)).status).toBe(413)
  })

  test('corta cuerpos enormes aunque no declaren content-length', async () => {
    const { deps } = testDeps()
    const chunk = new TextEncoder().encode('x'.repeat(100_000))
    let sent = 0
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        sent += 1
        if (sent > 20) controller.close()
        else controller.enqueue(chunk)
      },
    })
    const streamed = new Request(`${API}/v1/devices`, {
      method: 'POST',
      headers: { origin: ORIGIN },
      body,
      duplex: 'half',
    } as RequestInit)
    const response = await handle(streamed, deps)
    expect(response.status).toBe(413)
    expect(sent).toBeLessThan(20)
  })

  test('limita las altas por IP', async () => {
    const { deps } = testDeps()
    for (let i = 0; i < MAX_DEVICES_PER_IP_HOUR; i++) await register(deps)
    expect((await register(deps)).response.status).toBe(429)
    expect((await register(deps, '5.6.7.8')).response.status).toBe(201)
  })
})

describe('límites de frecuencia', () => {
  test('por IP en cualquier ruta, incluso con peticiones inválidas', async () => {
    const ip = countingLimiter(2)
    const { deps } = testDeps()
    const limited = { ...deps, limits: { ...deps.limits, ip: ip.limiter } }
    expect((await handle(request('POST', '/v1/devices', { body: '{roto' }), limited)).status).toBe(400)
    expect((await handle(request('GET', '/v1/vapid'), limited)).status).toBe(200)
    expect((await handle(request('POST', '/v1/devices', { body: '{roto' }), limited)).status).toBe(429)
    expect((await handle(request('GET', '/v1/vapid', { ip: '9.9.9.9' }), limited)).status).toBe(200)
    expect([...ip.counts.keys()].some((key) => key.includes('1.2.3.4'))).toBe(false)
  })

  test('por dispositivo en las rutas autenticadas', async () => {
    const device = countingLimiter(1)
    const { deps } = testDeps()
    const { token } = await register(deps)
    const limited = { ...deps, limits: { ...deps.limits, device: device.limiter } }
    const put = () => handle(request('PUT', '/v1/schedule', { token, body: { items: [] } }), limited)
    expect((await put()).status).toBe(204)
    expect((await put()).status).toBe(429)
  })

  test('el dictado tiene su propio límite', async () => {
    const voice = countingLimiter(1)
    const { deps } = testDeps()
    const { token } = await register(deps)
    const limited = { ...deps, limits: { ...deps.limits, voice: voice.limiter } }
    const send = () => handle(request('POST', '/v1/transcribe', { token, body: { audio: AUDIO } }), limited)
    expect((await send()).status).toBe(200)
    expect((await send()).status).toBe(429)
  })
})

describe('rutas autenticadas', () => {
  test.each([
    ['PUT', '/v1/schedule'],
    ['PUT', '/v1/devices/subscription'],
    ['POST', '/v1/transcribe'],
    ['DELETE', '/v1/devices'],
  ])('%s %s exige token válido', async (method, path) => {
    const { deps } = testDeps()
    await register(deps)
    expect((await handle(request(method, path, { body: {} }), deps)).status).toBe(401)
    expect((await handle(request(method, path, { body: {}, token: 'x'.repeat(43) }), deps)).status).toBe(401)
  })

  test('PUT /v1/schedule reemplaza la agenda completa', async () => {
    const { deps, memory, now } = testDeps()
    const { token, deviceId } = await register(deps)
    const put = (ids: string[]) =>
      handle(
        request('PUT', '/v1/schedule', {
          token,
          body: { items: ids.map((id) => ({ id, at: now() + 60_000, payload: 'Y2lmcmFkbw' })) },
        }),
        deps,
      )

    expect((await put(['a', 'b'])).status).toBe(204)
    expect((await put(['c'])).status).toBe(204)
    expect(memory.items().map((i) => [i.deviceId, i.id])).toEqual([[deviceId, 'c']])
  })

  test('PUT /v1/schedule arma la alarma con el aviso más próximo', async () => {
    const { deps, armed, now } = testDeps()
    const { token } = await register(deps)
    const items = [
      { id: 'b', at: now() + 120_000, payload: 'eA' },
      { id: 'a', at: now() + 60_000, payload: 'eA' },
    ]
    await handle(request('PUT', '/v1/schedule', { token, body: { items } }), deps)
    await handle(request('PUT', '/v1/schedule', { token, body: { items: [] } }), deps)
    expect(armed).toEqual([now() + 60_000])
  })

  test('PUT /v1/schedule valida los avisos', async () => {
    const { deps } = testDeps()
    const { token } = await register(deps)
    const response = await handle(request('PUT', '/v1/schedule', { token, body: { items: [{ id: 'a' }] } }), deps)
    expect(response.status).toBe(400)
  })

  test('PUT /v1/devices/subscription actualiza el endpoint', async () => {
    const { deps, memory } = testDeps()
    const { token, deviceId } = await register(deps)
    const next = subscription('https://web.push.apple.com/nuevo')
    const body = { subscription: next }
    expect((await handle(request('PUT', '/v1/devices/subscription', { token, body }), deps)).status).toBe(204)
    expect(memory.devices.get(deviceId)!.subscription.endpoint).toBe(next.endpoint)
  })

  test('POST /v1/transcribe devuelve el texto', async () => {
    const { deps, transcribed } = testDeps()
    const { token } = await register(deps)
    const response = await handle(request('POST', '/v1/transcribe', { token, body: { audio: AUDIO } }), deps)
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ data: { text: 'llamar a miguel', tasks: null } })
    expect(transcribed).toEqual([AUDIO])
  })

  test('POST /v1/transcribe con contexto devuelve también las tareas interpretadas', async () => {
    const { deps, interpreted } = testDeps()
    const { token } = await register(deps)
    const context = { today: '2026-09-14', now: '10:30' }
    const response = await handle(request('POST', '/v1/transcribe', { token, body: { audio: AUDIO, context } }), deps)
    const { data } = (await response.json()) as { data: { tasks: unknown[] } }
    expect(data.tasks).toHaveLength(1)
    expect(interpreted).toEqual([{ text: 'llamar a miguel', context }])
  })

  test('POST /v1/transcribe ignora un contexto inválido y sobrevive a un fallo de la IA', async () => {
    const { deps, interpreted } = testDeps()
    const { token } = await register(deps)
    const bad = await handle(request('POST', '/v1/transcribe', { token, body: { audio: AUDIO, context: { today: 'ayer', now: '25:00' } } }), deps)
    expect(((await bad.json()) as { data: { tasks: unknown } }).data.tasks).toBeNull()
    expect(interpreted).toEqual([])

    const broken: Deps = { ...deps, interpreter: { interpret: () => Promise.reject(new Error('modelo caído')) } }
    const context = { today: '2026-09-14', now: '10:30' }
    const response = await handle(request('POST', '/v1/transcribe', { token, body: { audio: AUDIO, context } }), broken)
    expect(response.status).toBe(200)
    expect(((await response.json()) as { data: { tasks: unknown } }).data.tasks).toBeNull()
  })

  test('POST /v1/transcribe no espera indefinidamente a la IA', async () => {
    const { deps } = testDeps()
    const { token } = await register(deps)
    const stuck: Deps = { ...deps, interpreter: { interpret: () => new Promise(() => undefined) } }
    const context = { today: '2026-09-14', now: '10:30' }
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    try {
      const pending = handle(request('POST', '/v1/transcribe', { token, body: { audio: AUDIO, context } }), stuck)
      // El temporizador se arma tras leer el cuerpo y transcribir, que no dependen del reloj.
      while (vi.getTimerCount() === 0) await new Promise((resolve) => setImmediate(resolve))
      await vi.advanceTimersByTimeAsync(INTERPRET_TIMEOUT_MS)
      const response = await pending
      expect(await response.json()).toEqual({ data: { text: 'llamar a miguel', tasks: null } })
    } finally {
      vi.useRealTimers()
    }
  })

  test('POST /v1/transcribe valida el audio', async () => {
    const { deps } = testDeps()
    const { token } = await register(deps)
    const send = (audio: unknown) => handle(request('POST', '/v1/transcribe', { token, body: { audio } }), deps)
    expect((await send('corto')).status).toBe(400)
    expect((await send('!'.repeat(2000))).status).toBe(400)
    expect((await send(42)).status).toBe(400)
  })

  test('POST /v1/transcribe admite audios más grandes que el resto de rutas', async () => {
    const { deps } = testDeps()
    const { token } = await register(deps)
    const long = 'A'.repeat(900_000)
    expect((await handle(request('POST', '/v1/transcribe', { token, body: { audio: long } }), deps)).status).toBe(200)
    const tooLong = 'A'.repeat(2_100_000)
    expect((await handle(request('POST', '/v1/transcribe', { token, body: { audio: tooLong } }), deps)).status).toBe(413)
  })

  test('POST /v1/transcribe no filtra detalles si falla la IA', async () => {
    const { deps } = testDeps()
    const { token } = await register(deps)
    const broken: Deps = { ...deps, transcriber: { transcribe: () => Promise.reject(new Error('modelo caído')) } }
    const response = await handle(request('POST', '/v1/transcribe', { token, body: { audio: AUDIO } }), broken)
    expect(response.status).toBe(502)
    expect(await response.text()).not.toContain('modelo')
  })

  test('POST /v1/transcribe responde 503 si se agota la cuota diaria de Workers AI', async () => {
    const { deps } = testDeps()
    const { token } = await register(deps)
    const quota = new Error('4006: you have used up your daily free allocation of 10,000 neurons')
    const exhausted: Deps = { ...deps, transcriber: { transcribe: () => Promise.reject(quota) } }
    const response = await handle(request('POST', '/v1/transcribe', { token, body: { audio: AUDIO } }), exhausted)
    expect(response.status).toBe(503)
    expect(await response.text()).not.toContain('neurons')
  })

  test('DELETE /v1/devices borra dispositivo y agenda', async () => {
    const { deps, memory, now } = testDeps()
    const { token, deviceId } = await register(deps)
    const body = { items: [{ id: 'a', at: now() + 1, payload: 'eA' }] }
    await handle(request('PUT', '/v1/schedule', { token, body }), deps)
    expect((await handle(request('DELETE', '/v1/devices', { token }), deps)).status).toBe(204)
    expect(memory.devices.has(deviceId)).toBe(false)
    expect(memory.items()).toEqual([])
  })

  test('los errores internos no filtran detalles', async () => {
    const { deps } = testDeps()
    const broken: Deps = {
      ...deps,
      store: { ...deps.store, countDevicesSince: () => Promise.reject(new Error('SQL secreto')) },
    }
    const response = await handle(request('POST', '/v1/devices', { body: { subscription: subscription() } }), broken)
    expect(response.status).toBe(500)
    expect(await response.text()).not.toContain('SQL')
  })
})
