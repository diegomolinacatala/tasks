import { describe, expect, test } from 'vitest'
import { FEEDBACK_KEEP_MS, MAX_FEEDBACK_PER_IP_HOUR, MAX_FEEDBACK_STORED, handle } from './app'
import { FEEDBACK_KEY, testDeps } from './testing'
import type { Deps } from './types'
import { MAX_FEEDBACK_MESSAGE, MAX_SHOT_CHARS, parseFeedback } from './validate'

const ORIGIN = 'https://diegomolinacatala.github.io'
const API = 'https://tasks-push.example.workers.dev'
const SHOT = '/9j/4AAQSkZJRgAB'

const report = (overrides: Record<string, unknown> = {}) => ({
  message: 'El botón de añadir se ve pequeño',
  shot: SHOT,
  context: {
    screen: 'agenda',
    sheet: null,
    region: { x: 10, y: 20, width: 120, height: 60 },
    viewport: { width: 390, height: 844 },
    elements: ['Cena — tl-row'],
    app: { version: '1.4 (33)', platform: 'ios', language: 'es', theme: 'dark' },
    device: 'iPhone · iOS 18.5',
  },
  ...overrides,
})

interface Options {
  body?: unknown
  key?: string
  origin?: string | null
  ip?: string
}

function request(method: string, path: string, { body, key, origin = ORIGIN, ip = '1.2.3.4' }: Options = {}) {
  const headers = new Headers({ 'cf-connecting-ip': ip })
  if (origin) headers.set('origin', origin)
  if (key) headers.set('authorization', `Bearer ${key}`)
  if (body !== undefined) headers.set('content-type', 'application/json')
  return new Request(`${API}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) })
}

const send = (deps: Deps, body: unknown = report(), ip?: string) => handle(request('POST', '/v1/feedback', { body, ip }), deps)

describe('parseFeedback', () => {
  test('acepta un mensaje con su captura y sanea el contexto', () => {
    const parsed = parseFeedback({ ...report(), context: { ...report().context, extra: 'fuera', screen: 'x'.repeat(200) } })
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.value.shot).toBe(SHOT)
    const context = JSON.parse(parsed.value.context)
    expect(context.extra).toBeUndefined()
    expect(context.screen).toHaveLength(60)
    expect(context.app).toEqual({ version: '1.4 (33)', platform: 'ios', language: 'es', theme: 'dark' })
  })

  test('sin contexto, uno vacío; sin captura, también vale', () => {
    const parsed = parseFeedback({ message: 'hola', shot: null })
    expect(parsed.ok && JSON.parse(parsed.value.context)).toMatchObject({ screen: '', region: null, elements: [] })
    expect(parsed.ok && parsed.value.shot).toBeNull()
  })

  test('rechaza mensajes vacíos o enormes y capturas que no son JPEG', () => {
    expect(parseFeedback({ message: '  ' }).ok).toBe(false)
    expect(parseFeedback({ message: 'a'.repeat(MAX_FEEDBACK_MESSAGE + 1) }).ok).toBe(false)
    expect(parseFeedback({ message: 'a', shot: 'iVBORw0KGgo' }).ok).toBe(false)
    expect(parseFeedback({ message: 'a', shot: '/9j/<script>' }).ok).toBe(false)
    // Base64 cortado: `atob` fallaría al leerla.
    expect(parseFeedback({ message: 'a', shot: '/9j/4AAQSkZJRg' }).ok).toBe(false)
    expect(parseFeedback({ message: 'a', shot: `/9j/${'A'.repeat(MAX_SHOT_CHARS)}` }).ok).toBe(false)
  })
})

describe('POST /v1/feedback', () => {
  test('guarda la sugerencia desde la app, sin cuenta', async () => {
    const { deps, memory } = testDeps()
    const response = await send(deps)
    expect(response.status).toBe(201)
    expect(response.headers.get('access-control-allow-origin')).toBe(ORIGIN)
    const [saved] = [...memory.feedback.values()]
    expect(saved).toMatchObject({ message: 'El botón de añadir se ve pequeño', shot: SHOT })
    expect(saved!.ipHash).not.toContain('1.2.3.4')
  })

  test('valida lo que llega', async () => {
    const { deps } = testDeps()
    expect((await send(deps, report({ message: '' }))).status).toBe(400)
  })

  test('limita las seguidas desde una misma IP', async () => {
    const { deps } = testDeps()
    for (let i = 0; i < MAX_FEEDBACK_PER_IP_HOUR; i++) expect((await send(deps)).status).toBe(201)
    expect((await send(deps)).status).toBe(429)
    expect((await send(deps, report(), '5.6.7.8')).status).toBe(201)
  })

  test('no pasa de un tope y olvida lo de hace más de un año', async () => {
    const { deps, memory, now } = testDeps()
    for (let i = 0; i < MAX_FEEDBACK_STORED; i++) {
      memory.feedback.set(`v${i}`, { id: `v${i}`, at: now(), message: 'm', context: '{}', shot: null, ipHash: `ip${i}` })
    }
    expect((await send(deps)).status).toBe(507)
    memory.feedback.set('v0', { id: 'v0', at: now() - FEEDBACK_KEEP_MS - 1, message: 'm', context: '{}', shot: null, ipHash: 'x' })
    expect((await send(deps)).status).toBe(201)
    expect(memory.feedback.has('v0')).toBe(false)
  })
})

describe('el buzón', () => {
  test('sin la clave no se lee nada', async () => {
    const { deps } = testDeps()
    await send(deps)
    expect((await handle(request('GET', '/v1/feedback', { origin: null }), deps)).status).toBe(401)
    expect((await handle(request('GET', '/v1/feedback', { origin: null, key: 'otra-clave-que-no-es-la-buena-000' }), deps)).status).toBe(401)
    const closed = { ...deps, config: { ...deps.config, feedbackKey: null } }
    expect((await handle(request('GET', '/v1/feedback', { origin: null, key: FEEDBACK_KEY }), closed)).status).toBe(404)
  })

  test('con la clave lista, enseña la captura y archiva', async () => {
    const { deps, memory } = testDeps()
    await send(deps)
    const list = await handle(request('GET', '/v1/feedback', { origin: API, key: FEEDBACK_KEY }), deps)
    expect(list.status).toBe(200)
    expect(list.headers.get('cache-control')).toBe('no-store')
    const { data } = (await list.json()) as { data: { id: string; message: string; hasShot: boolean }[] }
    expect(data).toHaveLength(1)
    expect(data[0]).toMatchObject({ message: 'El botón de añadir se ve pequeño', hasShot: true })
    const id = data[0]!.id

    const shot = await handle(request('GET', `/v1/feedback/${id}/shot`, { origin: null, key: FEEDBACK_KEY }), deps)
    expect(shot.headers.get('content-type')).toBe('image/jpeg')
    expect(new Uint8Array(await shot.arrayBuffer()).slice(0, 3)).toEqual(new Uint8Array([0xff, 0xd8, 0xff]))

    expect((await handle(request('DELETE', `/v1/feedback/${id}`, { origin: API, key: FEEDBACK_KEY }), deps)).status).toBe(204)
    expect(memory.feedback.size).toBe(0)
    expect((await handle(request('GET', `/v1/feedback/${id}/shot`, { origin: null, key: FEEDBACK_KEY }), deps)).status).toBe(404)
  })

  test('la página no lleva datos y ata su código a un nonce', async () => {
    const { deps } = testDeps()
    await send(deps)
    const page = await handle(request('GET', '/buzon', { origin: null }), deps)
    expect(page.status).toBe(200)
    expect(page.headers.get('content-type')).toContain('text/html')
    const csp = page.headers.get('content-security-policy') ?? ''
    const nonce = /'nonce-([A-Za-z0-9_-]+)'/.exec(csp)?.[1]
    expect(nonce).toBeTruthy()
    const html = await page.text()
    expect(html).toContain(`<script nonce="${nonce}">`)
    expect(html).not.toContain('El botón de añadir')
    expect(html).not.toContain('innerHTML')
  })
})
