import { describe, expect, test } from 'vitest'
import { handle } from './app'
import { PAIR_TTL_MS, handlePairHttp, memoryPairStore } from './pairCore'
import { RoomCore } from './roomCore'
import { handleRoomHttp } from './roomHttp'
import { memoryRoomStore } from './roomStore'
import { countingLimiter, testDeps } from './testing'
import type { Deps } from './types'

const ORIGIN = 'https://diegomolinacatala.github.io'
const API = 'https://tasks-push.example.workers.dev'
const NAME = 'bm9tYnJl'
const key = (n: number) => `k${String(n).padStart(21, '0')}`

interface Options {
  body?: unknown
  token?: string
  origin?: string | null
  headers?: Record<string, string>
}

function request(method: string, path: string, { body, token, origin = ORIGIN, headers = {} }: Options = {}) {
  const all = new Headers({ 'cf-connecting-ip': '1.2.3.4', ...headers })
  if (origin) all.set('origin', origin)
  if (token) all.set('authorization', `Bearer ${token}`)
  return new Request(`${API}${path}`, { method, headers: all, body: body === undefined ? undefined : JSON.stringify(body) })
}

async function call<T = Record<string, unknown>>(deps: Deps, method: string, path: string, options?: Options) {
  const response = await handle(request(method, path, options), deps)
  const text = await response.text()
  return { response, body: (text ? JSON.parse(text) : null) as { data: T; error?: string } }
}

async function createRoom(deps: Deps, kind = 'basket') {
  const { response, body } = await call<{ room: string; member: string; token: string }>(deps, 'POST', '/v1/rooms', {
    body: { kind, name: NAME },
  })
  return { response, ...body.data }
}

describe('salas por el Worker', () => {
  test('POST /v1/rooms elige un id de 22 y lo crea con CORS', async () => {
    const { deps, objects } = testDeps()
    const { response, room, member, token } = await createRoom(deps)
    expect(response.status).toBe(201)
    expect(response.headers.get('access-control-allow-origin')).toBe(ORIGIN)
    expect(room).toMatch(/^[A-Za-z0-9_-]{22}$/)
    expect(member).toMatch(/^[A-Za-z0-9_-]{8}$/)
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(objects.forwarded).toEqual([{ id: room, method: 'POST', path: `/v1/rooms/${room}` }])
    expect(objects.outcomes[0]?.alarm).toBeGreaterThan(0)
  })

  test('invitar, unirse, miembros, sincronizar y salir', async () => {
    const { deps, objects } = testDeps()
    const owner = await createRoom(deps)
    const base = `/v1/rooms/${owner.room}`
    const invite = await call<{ invite: string }>(deps, 'POST', `${base}/invites`, {
      token: owner.token,
      body: { ttl: 600, uses: 1 },
    })
    expect(invite.response.status).toBe(200)

    const joined = await call<{ member: string; token: string; kind: string }>(deps, 'POST', `${base}/join`, {
      body: { invite: invite.body.data.invite, name: NAME },
    })
    expect(joined.body.data.kind).toBe('basket')

    const members = await call<{ members: { id: string; you: boolean }[] }>(deps, 'GET', `${base}/members`, {
      token: joined.body.data.token,
    })
    expect(members.body.data.members.map((m) => [m.id, m.you])).toEqual([
      [owner.member, false],
      [joined.body.data.member, true],
    ])

    const put = await call(deps, 'POST', `${base}/sync`, {
      token: owner.token,
      body: { since: 0, put: [{ k: key(1), v: 'YQ', d: 0 }] },
    })
    expect(put.body.data).toEqual({ seq: 1, recs: [] })
    expect(JSON.parse(objects.outcomes.at(-1)?.broadcast ?? '{}')).toEqual({
      t: 'recs',
      seq: 1,
      recs: [{ k: key(1), v: 'YQ', d: 0, s: 1 }],
    })

    const read = await call(deps, 'POST', `${base}/sync`, { token: joined.body.data.token, body: { since: 0 } })
    expect(read.body.data).toEqual({ seq: 1, recs: [{ k: key(1), v: 'YQ', d: 0, s: 1 }] })

    const left = await handle(
      request('DELETE', `${base}/members/${joined.body.data.member}`, { token: joined.body.data.token }),
      deps,
    )
    expect(left.status).toBe(204)
    expect(left.headers.get('access-control-allow-origin')).toBe(ORIGIN)
    expect(objects.outcomes.at(-1)?.kicked).toBe(joined.body.data.member)
    const after = await call(deps, 'GET', `${base}/members`, { token: joined.body.data.token })
    expect(after.response.status).toBe(401)
  })

  test('una sala que no existe: 404; sin token: 401', async () => {
    const { deps } = testDeps()
    const missing = `/v1/rooms/${'B'.repeat(22)}`
    expect((await call(deps, 'POST', `${missing}/sync`, { token: 'x'.repeat(43), body: {} })).response.status).toBe(404)
    expect((await call(deps, 'POST', `${missing}/join`, { body: { invite: 'x'.repeat(43), name: NAME } })).response.status).toBe(404)
    const { room } = await createRoom(deps)
    expect((await call(deps, 'GET', `/v1/rooms/${room}/members`)).response.status).toBe(401)
  })

  test('ids y métodos malos no llegan al Durable Object', async () => {
    const { deps, objects } = testDeps()
    for (const [method, path] of [
      ['POST', '/v1/rooms/corta/sync'],
      ['POST', `/v1/rooms/${'C'.repeat(23)}/sync`],
      ['GET', `/v1/rooms/${'C'.repeat(22)}/sync`],
      ['DELETE', `/v1/rooms/${'C'.repeat(22)}/members`],
      ['GET', `/v1/rooms/${'C'.repeat(22)}/members/abc`],
      ['POST', `/v1/rooms/${'C'.repeat(22)}`],
      ['GET', '/v1/rooms'],
      ['GET', '/v1/pair'],
      ['DELETE', `/v1/pair/${'C'.repeat(22)}`],
    ] as const) {
      expect((await handle(request(method, path), deps)).status).toBe(404)
    }
    expect(objects.forwarded).toEqual([])
  })

  test('el socket pasa tal cual, sin CORS; sin Upgrade, 426; de otro origen, 403', async () => {
    const { deps } = testDeps()
    const path = `/v1/rooms/${'D'.repeat(22)}/socket`
    const upgraded = await handle(request('GET', path, { headers: { upgrade: 'websocket' } }), deps)
    expect(upgraded.headers.get('x-socket')).toBe('D'.repeat(22))
    expect(upgraded.headers.get('access-control-allow-origin')).toBeNull()
    expect((await handle(request('GET', path), deps)).status).toBe(426)
    const evil = await handle(request('GET', path, { origin: 'https://evil.com', headers: { upgrade: 'websocket' } }), deps)
    expect(evil.status).toBe(403)
  })

  test('crear salas, unirse y emparejar comparten un límite por IP', async () => {
    const { limiter } = countingLimiter(2)
    const base = testDeps()
    const deps: Deps = { ...base.deps, limits: { ...base.deps.limits, room: limiter } }
    expect((await createRoom(deps)).response.status).toBe(201)
    expect((await call(deps, 'POST', '/v1/pair', { body: { pub: 'YWJj' } })).response.status).toBe(201)
    expect((await createRoom(deps)).response.status).toBe(429)
    const join = await call(deps, 'POST', `/v1/rooms/${'E'.repeat(22)}/join`, { body: { invite: 'x'.repeat(43), name: NAME } })
    expect(join.response.status).toBe(429)
    expect((await call(deps, 'POST', '/v1/pair', { body: { pub: 'YWJj' } })).response.status).toBe(429)
  })

  test('cuerpo demasiado grande al crear: 413', async () => {
    const { deps } = testDeps()
    const { response } = await call(deps, 'POST', '/v1/rooms', { body: { kind: 'basket', name: 'a'.repeat(10_000) } })
    expect(response.status).toBe(413)
  })
})

describe('el Durable Object lee el cuerpo aunque responda un error', () => {
  test('sala que no existe o token malo: el flujo queda leído', async () => {
    const missing = new Request(`${API}/v1/rooms/${'F'.repeat(22)}/sync`, { method: 'POST', body: '{"since":0}' })
    const response = await handleRoomHttp(new RoomCore(memoryRoomStore()), missing, Date.now())
    expect(response.response.status).toBe(404)
    expect(missing.bodyUsed).toBe(true)
    const expired = new Request(`${API}/v1/pair/${'F'.repeat(22)}`, { method: 'PUT', body: '{"pub":"YQ","box":"YQ"}' })
    expect((await handlePairHttp(memoryPairStore(), expired, Date.now())).response.status).toBe(404)
    expect(expired.bodyUsed).toBe(true)
  })
})

describe('emparejar por el Worker', () => {
  test('crear, preguntar, responder y caducar', async () => {
    const { deps, setNow, now } = testDeps()
    const created = await call<{ id: string }>(deps, 'POST', '/v1/pair', { body: { pub: 'cHVibGljYQ' } })
    expect(created.response.status).toBe(201)
    const { id } = created.body.data
    expect(id).toMatch(/^[A-Za-z0-9_-]{22}$/)
    const path = `/v1/pair/${id}`
    expect((await call(deps, 'GET', path)).body.data).toEqual({ pub: 'cHVibGljYQ', reply: null })
    expect((await handle(request('PUT', path, { body: { pub: 'b3Ry', box: 'Y2FqYQ' } }), deps)).status).toBe(204)
    expect((await handle(request('PUT', path, { body: { pub: 'b3Ry', box: 'Y2FqYQ' } }), deps)).status).toBe(409)
    const answered = await call(deps, 'GET', path)
    expect(answered.response.headers.get('access-control-allow-origin')).toBe(ORIGIN)
    expect(answered.body.data).toEqual({ pub: 'cHVibGljYQ', reply: { pub: 'b3Ry', box: 'Y2FqYQ' } })
    setNow(now() + PAIR_TTL_MS)
    expect((await call(deps, 'GET', path)).response.status).toBe(404)
  })
})
