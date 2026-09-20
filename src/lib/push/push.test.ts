import { describe, expect, test } from 'vitest'
import type { ScheduleEntry } from '../schedule'
import { PushApiError, createPushApi } from './api'
import { createContentKey, decryptJson, encryptJson, fromBase64Url, toBase64Url } from './crypto'
import { FALLBACK_CONTENT, contentOf, isOpenTaskMessage, parseContent, parsePushData } from './message'
import { detectSupport, encryptSchedule, sameKey, scheduleFingerprint } from './sync'

const entry = (partial: Partial<ScheduleEntry> = {}): ScheduleEntry => ({
  id: 'r1',
  taskId: 't1',
  at: 1_000,
  title: 'Llamar a Juan',
  body: 'Hoy 17:00',
  badge: 2,
  overdue: false,
  ...partial,
})

describe('crypto', () => {
  test('base64url ida y vuelta sin relleno', () => {
    const bytes = new Uint8Array([0, 251, 255, 191, 10])
    const text = toBase64Url(bytes)
    expect(text).not.toMatch(/[+/=]/)
    expect(Array.from(fromBase64Url(text))).toEqual(Array.from(bytes))
  })

  test('cifra y descifra JSON con la misma clave', async () => {
    const key = await createContentKey()
    const token = await encryptJson(key, { title: 'Hola ñandú' })
    expect(token).not.toContain('Hola')
    expect(await decryptJson(key, token)).toEqual({ title: 'Hola ñandú' })
  })

  test('cada cifrado usa un IV distinto', async () => {
    const key = await createContentKey()
    expect(await encryptJson(key, 1)).not.toBe(await encryptJson(key, 1))
  })

  test('la clave no es exportable', async () => {
    const key = await createContentKey()
    expect(key.extractable).toBe(false)
  })

  test('otra clave o datos manipulados no se descifran', async () => {
    const token = await encryptJson(await createContentKey(), { a: 1 })
    await expect(decryptJson(await createContentKey(), token)).rejects.toThrow()
    await expect(decryptJson(await createContentKey(), 'AAAA')).rejects.toThrow(/incompleto/)
  })
})

describe('message', () => {
  test('parseContent sanea lo que llega descifrado', () => {
    expect(parseContent({ taskId: 't', title: 'x', body: 'y', badge: 3 })).toEqual({
      taskId: 't',
      title: 'x',
      body: 'y',
      badge: 3,
    })
    expect(parseContent({ title: 'x', badge: -1, taskId: '' })).toEqual({ taskId: null, title: 'x', body: '', badge: null })
    expect(parseContent({ title: 'x', at: 5 })).toMatchObject({ at: 5 })
    expect(parseContent({ title: 'x', at: '5' })).not.toHaveProperty('at')
    expect(parseContent({ title: 'x', overdue: true })).toMatchObject({ overdue: true })
    expect(parseContent({ title: 'x', overdue: 'sí' })).not.toHaveProperty('overdue')
    expect(parseContent({ title: '' })).toBeNull()
    expect(parseContent('x')).toBeNull()
  })

  test('contentOf recorta títulos largos', () => {
    const content = contentOf({ ...FALLBACK_CONTENT, title: 'a'.repeat(500), body: 'b'.repeat(500) })
    expect(content.title).toHaveLength(120)
    expect(content.title.endsWith('…')).toBe(true)
    expect(content.body).toHaveLength(160)
  })

  test('parsePushData solo acepta el sobre v1', () => {
    expect(parsePushData('{"v":1,"p":"abc"}')).toBe('abc')
    expect(parsePushData('{"v":2,"p":"abc"}')).toBeNull()
    expect(parsePushData('{"v":1}')).toBeNull()
    expect(parsePushData('null')).toBeNull()
    expect(parsePushData('no json')).toBeNull()
  })

  test('isOpenTaskMessage', () => {
    expect(isOpenTaskMessage({ type: 'open-task', taskId: 'a' })).toBe(true)
    expect(isOpenTaskMessage({ type: 'open-task', taskId: null })).toBe(true)
    expect(isOpenTaskMessage({ type: 'open-task', taskId: 'a', action: 'done' })).toBe(true)
    expect(isOpenTaskMessage({ type: 'open-task', taskId: null, action: 'today' })).toBe(true)
    expect(isOpenTaskMessage({ type: 'open-task', taskId: 'a', action: 'borrar' })).toBe(false)
    expect(isOpenTaskMessage({ type: 'open-task', taskId: 3 })).toBe(false)
    expect(isOpenTaskMessage({ type: 'otro' })).toBe(false)
    expect(isOpenTaskMessage(null)).toBe(false)
  })
})

describe('sync', () => {
  test('la huella cambia con el contenido y el dispositivo, no con el orden de llamada', async () => {
    const a = await scheduleFingerprint('d1', [entry()])
    expect(await scheduleFingerprint('d1', [entry()])).toBe(a)
    expect(await scheduleFingerprint('d2', [entry()])).not.toBe(a)
    expect(await scheduleFingerprint('d1', [entry({ title: 'otro' })])).not.toBe(a)
    expect(await scheduleFingerprint('d1', [entry({ badge: 3 })])).not.toBe(a)
    expect(await scheduleFingerprint('d1', [entry({ overdue: true })])).not.toBe(a)
  })

  test('encryptSchedule sube solo id, instante y contenido cifrado', async () => {
    const key = await createContentKey()
    const [item] = await encryptSchedule(key, [entry()])
    expect(Object.keys(item!).sort()).toEqual(['at', 'id', 'payload'])
    expect(item!.payload).not.toContain('Juan')
    expect(await decryptJson(key, item!.payload)).toEqual({
      taskId: 't1',
      title: 'Llamar a Juan',
      body: 'Hoy 17:00',
      badge: 2,
      at: 1_000,
    })
  })

  test('encryptSchedule marca lo atrasado solo cuando lo está', async () => {
    const key = await createContentKey()
    const [late] = await encryptSchedule(key, [entry({ overdue: true })])
    expect(await decryptJson(key, late!.payload)).toMatchObject({ overdue: true })
  })

  test.each([
    [{ userAgent: 'iPhone', platform: 'iPhone', maxTouchPoints: 5, standalone: false, hasPush: false }, 'needs-install'],
    [{ userAgent: 'iPhone', platform: 'iPhone', maxTouchPoints: 5, standalone: true, hasPush: true }, 'ready'],
    [{ userAgent: 'Macintosh', platform: 'MacIntel', maxTouchPoints: 5, standalone: false, hasPush: true }, 'needs-install'],
    [{ userAgent: 'Macintosh', platform: 'MacIntel', maxTouchPoints: 0, standalone: false, hasPush: true }, 'ready'],
    [{ userAgent: 'Android', platform: 'Linux', maxTouchPoints: 5, standalone: false, hasPush: false }, 'unsupported'],
  ])('detectSupport %j → %s', (env, expected) => {
    expect(detectSupport(env)).toBe(expected)
  })

  test('sameKey compara byte a byte', () => {
    const key = new Uint8Array([1, 2, 3])
    expect(sameKey(new Uint8Array([1, 2, 3]).buffer, key)).toBe(true)
    expect(sameKey(new Uint8Array([1, 2, 4]).buffer, key)).toBe(false)
    expect(sameKey(new Uint8Array([1, 2]).buffer, key)).toBe(false)
    expect(sameKey(null, key)).toBe(false)
  })
})

describe('api', () => {
  interface Call {
    url: string
    init?: RequestInit
  }

  function fakeFetch(respond: (call: Call) => Response) {
    const calls: Call[] = []
    const impl = async (url: string, init?: RequestInit) => {
      const call = { url, init }
      calls.push(call)
      return respond(call)
    }
    return { impl, calls }
  }

  const json = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

  const subscription = { endpoint: 'https://web.push.apple.com/x', keys: { p256dh: 'p', auth: 'a' } }

  test('vapidKey y register leen el sobre `data`', async () => {
    const fetch = fakeFetch(({ url }) =>
      url.endsWith('/v1/vapid') ? json(200, { data: { publicKey: 'PK' } }) : json(201, { data: { deviceId: 'd', token: 't' } }),
    )
    const api = createPushApi('https://api.test/', fetch.impl)
    expect(await api.vapidKey()).toBe('PK')
    expect(await api.register(subscription)).toEqual({ deviceId: 'd', token: 't' })
    expect(fetch.calls[1]!.url).toBe('https://api.test/v1/devices')
    expect(JSON.parse(String(fetch.calls[1]!.init!.body))).toEqual({ subscription })
  })

  test('registerVoice da de alta la app nativa sin suscripción', async () => {
    const fetch = fakeFetch(() => json(201, { data: { deviceId: 'd', token: 't' } }))
    const api = createPushApi('https://api.test', fetch.impl)
    expect(await api.registerVoice()).toEqual({ deviceId: 'd', token: 't' })
    expect(JSON.parse(String(fetch.calls[0]!.init!.body))).toEqual({ voice: true })
  })

  test('las rutas autenticadas mandan el token y aceptan 204', async () => {
    const fetch = fakeFetch(() => new Response(null, { status: 204 }))
    const api = createPushApi('https://api.test', fetch.impl)
    await api.putSchedule('tok', [{ id: 'a', at: 1, payload: 'x' }])
    await api.updateSubscription('tok', subscription)
    await api.unregister('tok')
    await api.unregister('tok')
    expect(fetch.calls.map((c) => `${c.init!.method} ${c.url}`)).toEqual([
      'PUT https://api.test/v1/schedule',
      'PUT https://api.test/v1/devices/subscription',
      'DELETE https://api.test/v1/devices',
      'DELETE https://api.test/v1/devices',
    ])
    expect((fetch.calls[0]!.init!.headers as Record<string, string>).authorization).toBe('Bearer tok')
  })

  test('keepalive solo al salir de la app y con cuerpos pequeños', async () => {
    const fetch = fakeFetch(() => new Response(null, { status: 204 }))
    const api = createPushApi('https://api.test', fetch.impl)
    await api.putSchedule('tok', [{ id: 'a', at: 1, payload: 'x' }])
    await api.putSchedule('tok', [{ id: 'a', at: 1, payload: 'x' }], { keepalive: true })
    await api.putSchedule('tok', [{ id: 'a', at: 1, payload: 'x'.repeat(70_000) }], { keepalive: true })
    expect(fetch.calls.map((c) => c.init!.keepalive)).toEqual([false, true, false])
  })

  test('transcribe devuelve el texto y valida la respuesta', async () => {
    const ok = createPushApi('https://api.test', fakeFetch(() => json(200, { data: { text: 'hola' } })).impl)
    expect(await ok.transcribe('tok', 'QUJD')).toEqual({ text: 'hola', tasks: null })
    const withTasks = fakeFetch(() => json(200, { data: { text: 'hola', tasks: [{ title: 'x' }] } }))
    const context = { today: '2026-09-14', now: '10:00' }
    expect(await createPushApi('https://api.test', withTasks.impl).transcribe('tok', 'QUJD', context)).toEqual({
      text: 'hola',
      tasks: [{ title: 'x' }],
    })
    expect(JSON.parse(String(withTasks.calls[0]!.init!.body))).toEqual({ audio: 'QUJD', context })
    const bad = createPushApi('https://api.test', fakeFetch(() => json(200, { data: {} })).impl)
    await expect(bad.transcribe('tok', 'QUJD')).rejects.toThrow(/inesperada/)
  })

  test('transcribe se puede cancelar: el aborto no se disfraza de error de conexión', async () => {
    const controller = new AbortController()
    const fetch = fakeFetch(() => json(200, { data: { text: 'hola' } }))
    const api = createPushApi('https://api.test', (input, init) => {
      controller.abort()
      return init?.signal?.aborted ? Promise.reject(init.signal.reason) : fetch.impl(input, init)
    })
    const error = await api.transcribe('tok', 'QUJD', undefined, { signal: controller.signal }).catch((e: unknown) => e)
    expect(error).not.toBeInstanceOf(PushApiError)
    expect(error).toMatchObject({ name: 'AbortError' })
  })

  test('los errores del servidor llegan con estado y mensaje', async () => {
    const api = createPushApi('https://api.test', fakeFetch(() => json(401, { error: 'no autorizado' })).impl)
    const error = await api.putSchedule('tok', []).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(PushApiError)
    expect(error).toMatchObject({ status: 401, message: 'no autorizado' })
  })

  test('sin conexión da un error legible', async () => {
    const api = createPushApi('https://api.test', () => Promise.reject(new TypeError('Failed to fetch')))
    await expect(api.vapidKey()).rejects.toMatchObject({ status: 0 })
  })

  test('respuestas inesperadas no se aceptan', async () => {
    const api = createPushApi('https://api.test', fakeFetch(() => json(200, { data: {} })).impl)
    await expect(api.vapidKey()).rejects.toThrow(/inesperada/)
    await expect(api.register(subscription)).rejects.toThrow(/inesperada/)
    const broken = createPushApi('https://api.test', fakeFetch(() => new Response('<html>', { status: 502 })).impl)
    await expect(broken.vapidKey()).rejects.toMatchObject({ status: 502, message: 'Error 502' })
  })
})
