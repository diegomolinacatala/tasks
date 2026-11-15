import { describe, expect, test } from 'vitest'
import { MAX_BOX_CHARS, MAX_PUB_CHARS, PAIR_TTL_MS, handlePairHttp, memoryPairStore } from './pairCore'

const NOW = Date.UTC(2026, 10, 14, 10, 0, 0)
const ID = 'A'.repeat(22)
const PUB = 'BCdefghij_-0123456789'
const URL_ = `https://x.test/v1/pair/${ID}`

const call = (store: ReturnType<typeof memoryPairStore>, method: string, body?: unknown, now = NOW, url = URL_) =>
  handlePairHttp(store, new Request(url, { method, body: body === undefined ? undefined : JSON.stringify(body) }), now)

describe('emparejar', () => {
  test('crear, preguntar, responder una vez', async () => {
    const store = memoryPairStore()
    const created = await call(store, 'POST', { pub: PUB })
    expect(created.response.status).toBe(201)
    expect(await created.response.json()).toEqual({ data: { id: ID } })
    expect(created.alarm).toBe(NOW + PAIR_TTL_MS)

    const asked = await call(store, 'GET')
    expect(asked.response.headers.get('cache-control')).toBe('no-store')
    expect(await asked.response.json()).toEqual({ data: { pub: PUB, reply: null } })

    expect((await call(store, 'PUT', { pub: 'cmVzcHVlc3Rh', box: 'Y2FqYQ' })).response.status).toBe(204)
    expect((await call(store, 'PUT', { pub: 'b3RyYQ', box: 'b3RyYQ' })).response.status).toBe(409)
    const answered = await (await call(store, 'GET')).response.json()
    expect(answered).toEqual({ data: { pub: PUB, reply: { pub: 'cmVzcHVlc3Rh', box: 'Y2FqYQ' } } })
  })

  test('a los 10 minutos ya no existe', async () => {
    const store = memoryPairStore()
    await call(store, 'POST', { pub: PUB })
    expect((await call(store, 'GET', undefined, NOW + PAIR_TTL_MS - 1)).response.status).toBe(200)
    expect((await call(store, 'GET', undefined, NOW + PAIR_TTL_MS)).response.status).toBe(404)
    expect((await call(store, 'PUT', { pub: PUB, box: PUB }, NOW + PAIR_TTL_MS)).response.status).toBe(404)
  })

  test('sin crear: 404; crear dos veces: 409', async () => {
    const store = memoryPairStore()
    expect((await call(store, 'GET')).response.status).toBe(404)
    await call(store, 'POST', { pub: PUB })
    expect((await call(store, 'POST', { pub: PUB })).response.status).toBe(409)
  })

  test('valida claves y caja', async () => {
    const store = memoryPairStore()
    expect((await call(store, 'POST', { pub: 'a'.repeat(MAX_PUB_CHARS + 1) })).response.status).toBe(400)
    expect((await call(store, 'POST', { pub: 'con espacio' })).response.status).toBe(400)
    expect((await call(store, 'POST', 'roto')).response.status).toBe(400)
    await call(store, 'POST', { pub: PUB })
    expect((await call(store, 'PUT', { pub: PUB, box: 'a'.repeat(MAX_BOX_CHARS + 1) })).response.status).toBe(400)
    expect((await call(store, 'PUT', { pub: PUB, box: 'a'.repeat(MAX_BOX_CHARS) })).response.status).toBe(204)
    expect((await call(store, 'PUT', { box: PUB })).response.status).toBe(400)
  })

  test('otras rutas y métodos', async () => {
    const store = memoryPairStore()
    await call(store, 'POST', { pub: PUB })
    expect((await call(store, 'DELETE')).response.status).toBe(405)
    expect((await call(store, 'GET', undefined, NOW, 'https://x.test/v1/pair/corto')).response.status).toBe(404)
  })
})
