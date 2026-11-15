import { describe, expect, test } from 'vitest'
import { PAGE_SIZE, RoomCore } from './roomCore'
import { MAX_PUTS, MAX_VALUE_CHARS, parseCreate, parseInvite, parseJoin, parsePuts, parseSince } from './roomInput'
import { CLOSE, handleSocketMessage, type SocketAttachment, type SocketPort } from './roomSocket'
import { memoryRoomStore } from './roomStore'

const NOW = Date.UTC(2026, 10, 14, 10, 0, 0)
const NAME = 'bm9tYnJl'
const key = (n: number) => `k${String(n).padStart(21, '0')}`
const rec = (n: number, d: 0 | 1 = 0) => ({ k: key(n), v: `dmFsb3I${n}`, d })

function port() {
  const sent: Record<string, unknown>[] = []
  const broadcast: Record<string, unknown>[] = []
  const closed: { code: number; reason: string }[] = []
  let attachment: SocketAttachment = { member: null }
  const value: SocketPort = {
    send: (text) => void sent.push(JSON.parse(text) as Record<string, unknown>),
    broadcast: (text) => void broadcast.push(JSON.parse(text) as Record<string, unknown>),
    close: (code, reason) => void closed.push({ code, reason }),
    attach: (next) => void (attachment = next),
  }
  return { port: value, sent, broadcast, closed, attachment: () => attachment }
}

async function room() {
  const core = new RoomCore(memoryRoomStore())
  const created = await core.create({ kind: 'personal', name: NAME }, NOW)
  const msg = (core_: RoomCore, attachment: SocketAttachment, data: unknown, p: SocketPort, now = NOW) =>
    handleSocketMessage(core_, attachment, typeof data === 'string' ? data : JSON.stringify(data), p, now)
  /** Un socket ya autenticado. */
  const authed = async (since = 0) => {
    const p = port()
    await msg(core, { member: null }, { t: 'auth', token: created.token, since }, p.port)
    return { ...p, send: (data: unknown) => msg(core, p.attachment(), data, p.port) }
  }
  return { core, created, msg, authed }
}

describe('validar lo que llega', () => {
  test('registros: clave de 22, valor base64url de 16 KB, d 0 o 1', () => {
    expect(parsePuts([rec(1), rec(2, 1)]).ok).toBe(true)
    expect(parsePuts(undefined)).toEqual({ ok: true, value: [] })
    expect(parsePuts({}).ok).toBe(false)
    expect(parsePuts([{ ...rec(1), k: 'corta' }]).ok).toBe(false)
    expect(parsePuts([{ ...rec(1), v: 'a'.repeat(MAX_VALUE_CHARS) }]).ok).toBe(true)
    expect(parsePuts([{ ...rec(1), v: 'a'.repeat(MAX_VALUE_CHARS + 1) }]).ok).toBe(false)
    expect(parsePuts([{ ...rec(1), v: 'no vale+/' }]).ok).toBe(false)
    expect(parsePuts([{ ...rec(1), v: '' }]).ok).toBe(false)
    expect(parsePuts([{ ...rec(1), d: 2 }]).ok).toBe(false)
    expect(parsePuts([{ k: key(1), v: 'YQ' }]).ok).toBe(false)
    expect(parsePuts(Array.from({ length: MAX_PUTS }, (_, i) => rec(i))).ok).toBe(true)
    expect(parsePuts(Array.from({ length: MAX_PUTS + 1 }, (_, i) => rec(i))).ok).toBe(false)
  })

  test('sala, invitación y unión', () => {
    expect(parseCreate({ kind: 'basket', name: NAME })).toEqual({ ok: true, value: { kind: 'basket', name: NAME } })
    expect(parseCreate({ kind: 'otra', name: NAME }).ok).toBe(false)
    expect(parseCreate({ kind: 'basket', name: 'a'.repeat(401) }).ok).toBe(false)
    expect(parseCreate({ kind: 'basket', name: 'con espacios' }).ok).toBe(false)
    expect(parseCreate([]).ok).toBe(false)
    expect(parseInvite({ ttl: 60, uses: 1 }).ok).toBe(true)
    expect(parseInvite({ ttl: 7 * 24 * 3600, uses: 50 }).ok).toBe(true)
    expect(parseInvite({ ttl: 59, uses: 1 }).ok).toBe(false)
    expect(parseInvite({ ttl: 7 * 24 * 3600 + 1, uses: 1 }).ok).toBe(false)
    expect(parseInvite({ ttl: 60, uses: 0 }).ok).toBe(false)
    expect(parseInvite({ ttl: 60, uses: 51 }).ok).toBe(false)
    expect(parseInvite({ ttl: 60.5, uses: 1 }).ok).toBe(false)
    expect(parseJoin({ invite: 'a'.repeat(43), name: NAME }).ok).toBe(true)
    expect(parseJoin({ invite: 'corta', name: NAME }).ok).toBe(false)
    expect(parseSince(undefined)).toEqual({ ok: true, value: 0 })
    expect(parseSince(-1).ok).toBe(false)
    expect(parseSince('3').ok).toBe(false)
  })
})

describe('socket', () => {
  test('lo primero tiene que ser auth', async () => {
    const { core, msg } = await room()
    const p = port()
    await msg(core, { member: null }, { t: 'ping' }, p.port)
    expect(p.closed).toEqual([{ code: CLOSE.unauthorized, reason: expect.any(String) }])
    const binary = port()
    await handleSocketMessage(core, { member: null }, new ArrayBuffer(4), binary.port, NOW)
    expect(binary.closed[0]?.code).toBe(CLOSE.unauthorized)
  })

  test('token malo: 4001; sala que no existe: 4004; since malo: 1008', async () => {
    const { core, msg } = await room()
    const bad = port()
    await msg(core, { member: null }, { t: 'auth', token: 'x'.repeat(43), since: 0 }, bad.port)
    expect(bad.closed[0]?.code).toBe(CLOSE.unauthorized)
    const missing = port()
    await msg(new RoomCore(memoryRoomStore()), { member: null }, { t: 'auth', token: 'x'.repeat(43) }, missing.port)
    expect(missing.closed[0]?.code).toBe(CLOSE.missing)
    const since = port()
    await msg(core, { member: null }, { t: 'auth', token: 'x'.repeat(43), since: -3 }, since.port)
    expect(since.closed[0]?.code).toBe(CLOSE.invalid)
  })

  test('al autenticar, lo pendiente en lotes y después ready', async () => {
    const { core, created, authed } = await room()
    for (let i = 0; i < 3; i++) core.write(Array.from({ length: 500 }, (_, j) => rec(i * 500 + j)), NOW)
    const socket = await authed()
    expect(socket.attachment()).toEqual({ member: created.member })
    expect(socket.sent.map((m) => [m.t, (m.recs as unknown[] | undefined)?.length, m.seq, m.more])).toEqual([
      ['recs', PAGE_SIZE, PAGE_SIZE, true],
      ['recs', 500, 1500, undefined],
      ['ready', undefined, 1500, undefined],
    ])
    const later = await authed(1500)
    expect(later.sent).toEqual([{ t: 'ready', seq: 1500 }])
  })

  test('ready lleva reset si `since` no cuadra', async () => {
    const { core, authed } = await room()
    core.write([rec(1)], NOW)
    const socket = await authed(42)
    expect(socket.sent.at(-1)).toEqual({ t: 'ready', seq: 1, reset: true })
    expect(socket.sent[0]).toMatchObject({ t: 'recs', recs: [{ k: key(1), s: 1 }] })
  })

  test('put: ack al que lo manda y los registros a los demás', async () => {
    const { authed } = await room()
    const socket = await authed()
    await socket.send({ t: 'put', id: 'a1', recs: [rec(1), rec(2, 1)] })
    expect(socket.sent.at(-1)).toEqual({ t: 'ack', id: 'a1', seq: 2 })
    expect(socket.broadcast).toEqual([
      {
        t: 'recs',
        seq: 2,
        recs: [
          { ...rec(1), s: 1 },
          { ...rec(2, 1), s: 2 },
        ],
      },
    ])
  })

  test('un put inválido o que no cabe responde con error y el socket sigue', async () => {
    const { authed } = await room()
    const socket = await authed()
    await socket.send({ t: 'put', id: 7, recs: [{ k: 'mal' }] })
    expect(socket.sent.at(-1)).toMatchObject({ t: 'error', id: 7, status: 400 })
    await socket.send({ t: 'put', recs: [] })
    expect(socket.closed.at(-1)?.code).toBe(CLOSE.invalid)
    expect(socket.broadcast).toEqual([])
  })

  test('ping → pong; mensajes desconocidos o rotos cierran', async () => {
    const { authed } = await room()
    const socket = await authed()
    await socket.send({ t: 'ping' })
    expect(socket.sent.at(-1)).toEqual({ t: 'pong' })
    await socket.send({ t: 'auth', token: 'x' })
    expect(socket.closed).toEqual([])
    await socket.send('{roto')
    expect(socket.closed.at(-1)?.code).toBe(CLOSE.invalid)
  })

  test('quien ya no es miembro recibe 4003; si la sala desapareció, 4004', async () => {
    const { core, authed } = await room()
    const socket = await authed()
    const member = core.current(socket.attachment().member ?? '')
    if (!member) throw new Error('sin miembro')
    const joined = await core.join(
      { invite: (await core.createInvite(member, { ttl: 60, uses: 1 }, NOW)).invite, name: NAME },
      NOW,
    )
    core.remove(member, joined.member)
    const gone = port()
    await handleSocketMessage(core, { member: joined.member }, JSON.stringify({ t: 'ping' }), gone.port, NOW)
    expect(gone.closed[0]?.code).toBe(CLOSE.removed)
    core.destroy()
    await socket.send({ t: 'ping' })
    expect(socket.closed.at(-1)?.code).toBe(CLOSE.missing)
  })
})
