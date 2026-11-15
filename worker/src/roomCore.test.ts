import { describe, expect, test } from 'vitest'
import { sha256Hex } from './auth'
import { HttpError } from './http'
import {
  MAX_LIVE_INVITES,
  MAX_MEMBERS,
  MAX_RECORDS,
  PAGE_SIZE,
  PRUNE_EVERY_MS,
  ROOM_IDLE_MS,
  RoomCore,
  SEEN_EVERY_MS,
  TOMBSTONE_KEEP_MS,
} from './roomCore'
import type { RecordInput } from './roomInput'
import { memoryRoomStore, type RoomKind } from './roomStore'

const NOW = Date.UTC(2026, 10, 14, 10, 0, 0)
const DAY = 24 * 60 * 60 * 1000
const NAME = 'bm9tYnJlLWNpZnJhZG8'

const key = (n: number) => `k${String(n).padStart(21, '0')}`
const rec = (n: number, d: 0 | 1 = 0, v = `dmFsb3I${n}`): RecordInput => ({ k: key(n), v, d })
const recs = (from: number, count: number, d: 0 | 1 = 0) => Array.from({ length: count }, (_, i) => rec(from + i, d))

async function room(kind: RoomKind = 'basket') {
  const store = memoryRoomStore()
  const core = new RoomCore(store)
  const created = await core.create({ kind, name: NAME }, NOW)
  const owner = await core.authenticate(created.token, NOW)
  const invite = async (uses = 1, ttl = 3600, now = NOW) => (await core.createInvite(owner, { ttl, uses }, now)).invite
  const join = async (now = NOW) => {
    const joined = await core.join({ invite: await invite(1, 3600, now), name: NAME }, now)
    return { ...joined, auth: await core.authenticate(joined.token, now) }
  }
  return { store, core, created, owner, invite, join }
}

async function expectStatus(promise: Promise<unknown> | (() => unknown), status: number) {
  try {
    await (typeof promise === 'function' ? promise() : promise)
  } catch (error) {
    expect(error).toBeInstanceOf(HttpError)
    expect((error as HttpError).status).toBe(status)
    return
  }
  throw new Error(`se esperaba ${status}`)
}

describe('crear y autenticar', () => {
  test('quien crea es dueño y solo se guarda la huella del token', async () => {
    const { store, created, owner } = await room()
    expect(created.token).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(owner.role).toBe('owner')
    expect(owner.tokenHash).toBe(await sha256Hex(created.token))
    expect(JSON.stringify(store.members())).not.toContain(created.token)
    expect(store.meta()).toMatchObject({ kind: 'basket', seq: 0, count: 0, floor: 0, touched: NOW })
  })

  test('crear una que ya existe: 409', async () => {
    const { core } = await room()
    await expectStatus(core.create({ kind: 'personal', name: NAME }, NOW), 409)
  })

  test('sin sala: 404; token malo o ausente: 401', async () => {
    const empty = new RoomCore(memoryRoomStore())
    await expectStatus(empty.authenticate('x'.repeat(43), NOW), 404)
    expect(() => empty.read(0)).toThrow(HttpError)
    const { core } = await room()
    await expectStatus(core.authenticate('y'.repeat(43), NOW), 401)
    await expectStatus(core.authenticate(null, NOW), 401)
  })

  test('`seen` se apunta como mucho una vez por hora', async () => {
    const { core, created, store, owner } = await room()
    await core.authenticate(created.token, NOW + SEEN_EVERY_MS - 1)
    expect(store.memberById(owner.id)?.seen).toBe(NOW)
    const later = await core.authenticate(created.token, NOW + SEEN_EVERY_MS)
    expect(later.seen).toBe(NOW + SEEN_EVERY_MS)
    expect(store.memberById(owner.id)?.seen).toBe(NOW + SEEN_EVERY_MS)
  })
})

describe('invitar y unirse', () => {
  test('en una cesta, quien entra es miembro; en la sala personal, dueño', async () => {
    const basket = await room('basket')
    const joined = await basket.join()
    expect(joined.kind).toBe('basket')
    expect(joined.auth.role).toBe('member')
    const personal = await room('personal')
    const linked = await personal.join()
    expect(linked.kind).toBe('personal')
    expect(linked.auth.role).toBe('owner')
  })

  test('la invitación se gasta, caduca y solo vale la buena', async () => {
    const { core, invite, store } = await room()
    const twice = await invite(2)
    await core.join({ invite: twice, name: NAME }, NOW)
    await core.join({ invite: twice, name: NAME }, NOW)
    await expectStatus(core.join({ invite: twice, name: NAME }, NOW), 403)
    const short = await invite(5, 60)
    await expectStatus(core.join({ invite: short, name: NAME }, NOW + 60_000), 403)
    await expectStatus(core.join({ invite: 'z'.repeat(43), name: NAME }, NOW), 403)
    // La gastada ya no está; la caducada se limpia al crear la siguiente.
    expect(store.invites().map((i) => i.uses)).toEqual([5])
  })

  test('solo el dueño invita', async () => {
    const { core, join } = await room()
    const member = await join()
    await expectStatus(core.createInvite(member.auth, { ttl: 60, uses: 1 }, NOW), 403)
  })

  test(`como mucho ${MAX_LIVE_INVITES} vivas; las caducadas no cuentan`, async () => {
    const { invite } = await room()
    await invite(1, 60)
    for (let i = 1; i < MAX_LIVE_INVITES; i++) await invite(1, 3600)
    await expectStatus(invite(1, 3600), 409)
    // La de 60 s ya caducó: deja sitio.
    await invite(1, 3600, NOW + 61_000)
    await expectStatus(invite(1, 3600, NOW + 61_000), 409)
  })

  test(`como mucho ${MAX_MEMBERS} miembros`, async () => {
    const { core, invite } = await room()
    const code = await invite(50, 3600)
    for (let i = 1; i < MAX_MEMBERS; i++) await core.join({ invite: code, name: NAME }, NOW)
    await expectStatus(core.join({ invite: code, name: NAME }, NOW), 409)
  })

  test('la lista de miembros dice quién eres', async () => {
    const { core, owner, join } = await room()
    const member = await join(NOW + 1)
    const list = core.members(member.auth)
    expect(list).toEqual([
      { id: owner.id, role: 'owner', name: NAME, created: NOW, seen: NOW, you: false },
      { id: member.member, role: 'member', name: NAME, created: NOW + 1, seen: NOW + 1, you: true },
    ])
    expect(JSON.stringify(list)).not.toContain('tokenHash')
  })
})

describe('quitar miembros', () => {
  test('cada uno puede salir; un miembro no echa a otros', async () => {
    const { core, owner, join, store } = await room()
    const a = await join()
    const b = await join()
    expect(() => core.remove(a.auth, owner.id)).toThrow(HttpError)
    expect(() => core.remove(a.auth, b.member)).toThrow(HttpError)
    expect(core.remove(a.auth, a.member)).toEqual({ kicked: a.member, destroyed: false })
    expect(store.memberById(a.member)).toBeNull()
  })

  test('quitar a quien no está: 404', async () => {
    const { core, owner } = await room()
    await expectStatus(() => core.remove(owner, 'nadie123'), 404)
  })

  test('echar a alguien de una cesta anula las invitaciones vivas', async () => {
    const { core, owner, join, invite, store } = await room()
    const member = await join()
    const pending = await invite(3)
    core.remove(owner, member.member)
    expect(store.invites()).toEqual([])
    await expectStatus(core.join({ invite: pending, name: NAME }, NOW), 403)
  })

  test('en la sala personal, quitar un dispositivo no anula las invitaciones', async () => {
    const { core, owner, join, invite, store } = await room('personal')
    const linked = await join()
    await invite(1)
    core.remove(owner, linked.member)
    expect(store.invites()).toHaveLength(1)
  })

  test('si el dueño sale de una cesta, pasa a serlo el miembro más antiguo', async () => {
    const { core, owner, join, store } = await room()
    const first = await join(NOW + 1)
    const second = await join(NOW + 2)
    core.remove(owner, owner.id)
    expect(store.memberById(first.member)?.role).toBe('owner')
    expect(store.memberById(second.member)?.role).toBe('member')
  })

  test('sin miembros, la sala se borra entera', async () => {
    const { core, owner, store } = await room()
    core.write(recs(1, 3), NOW)
    expect(core.remove(owner, owner.id)).toEqual({ kicked: owner.id, destroyed: true })
    expect(core.exists()).toBe(false)
    expect(store.recordsAfter(0, 10)).toEqual([])
  })
})

describe('sincronizar', () => {
  test('cada escritura recibe un seq creciente y `since` da solo lo posterior', async () => {
    const { core } = await room()
    const first = core.write(recs(1, 2), NOW)
    expect(first.recs.map((r) => r.s)).toEqual([1, 2])
    expect(first.seq).toBe(2)
    core.write([rec(3, 1)], NOW)
    expect(core.read(2)).toEqual({ recs: [{ ...rec(3, 1), s: 3 }], seq: 3, more: false, reset: false })
    expect(core.read(3)).toEqual({ recs: [], seq: 3, more: false, reset: false })
    expect(core.read(0).recs.map((r) => r.k)).toEqual([key(1), key(2), key(3)])
  })

  test('reescribir una clave la mueve al final sin contar dos veces; en un mismo envío vale la última', async () => {
    const { core, store } = await room()
    core.write(recs(1, 2), NOW)
    const written = core.write([rec(1, 0, 'dW5v'), rec(1, 1, 'ZG9z')], NOW)
    expect(written.recs).toEqual([{ k: key(1), v: 'ZG9z', d: 1, s: 3 }])
    expect(store.meta()?.count).toBe(2)
    expect(core.read(2).recs).toEqual([{ k: key(1), v: 'ZG9z', d: 1, s: 3 }])
  })

  test('escribir nada no cambia el seq', async () => {
    const { core, store } = await room()
    expect(core.write([], NOW)).toEqual({ recs: [], seq: 0 })
    expect(store.meta()?.seq).toBe(0)
  })

  test(`por páginas de ${PAGE_SIZE} con \`more\``, async () => {
    const { core } = await room()
    for (let i = 0; i < 5; i++) core.write(recs(i * 500, 500), NOW)
    const one = core.read(0)
    expect(one).toMatchObject({ seq: PAGE_SIZE, more: true })
    expect(one.recs).toHaveLength(PAGE_SIZE)
    const two = core.read(one.seq)
    expect(two).toMatchObject({ seq: 2 * PAGE_SIZE, more: true })
    const three = core.read(two.seq)
    expect(three).toMatchObject({ seq: 2500, more: false })
    expect(three.recs).toHaveLength(500)
  })

  test(`como mucho ${MAX_RECORDS} registros (reescribir sigue valiendo)`, async () => {
    const { core } = await room()
    for (let i = 0; i < MAX_RECORDS / 500; i++) core.write(recs(i * 500, 500), NOW)
    await expectStatus(() => core.write([rec(MAX_RECORDS + 1)], NOW), 507)
    await expectStatus(() => core.write([rec(1), rec(MAX_RECORDS + 1)], NOW), 507)
    expect(core.write([rec(1, 1)], NOW).seq).toBe(MAX_RECORDS + 1)
  })

  test('un `since` mayor que el último seq pide todo con `reset`', async () => {
    const { core } = await room()
    core.write(recs(1, 2), NOW)
    expect(core.read(99)).toMatchObject({ reset: true, seq: 2 })
    expect(core.read(99).recs).toHaveLength(2)
  })
})

describe('actividad, poda y caducidad', () => {
  test('la actividad se apunta como mucho una vez al día y reprograma la alarma', async () => {
    const { core, store } = await room()
    expect(core.alarmAt()).toBe(NOW + ROOM_IDLE_MS)
    expect(core.touch(NOW + DAY - 1)).toBeNull()
    expect(core.touch(NOW + DAY)).toBe(NOW + DAY + ROOM_IDLE_MS)
    expect(store.meta()?.touched).toBe(NOW + DAY)
    expect(core.expired(NOW + DAY + ROOM_IDLE_MS - 1)).toBe(false)
    expect(core.expired(NOW + DAY + ROOM_IDLE_MS)).toBe(true)
  })

  test('sin sala, `touch` no hace nada y la alarma la da por caducada', () => {
    const core = new RoomCore(memoryRoomStore())
    expect(core.touch(NOW)).toBeNull()
    expect(core.alarmAt()).toBeNull()
    expect(core.expired(NOW)).toBe(true)
  })

  async function pruned() {
    const setup = await room()
    const { core } = setup
    // Lo antiguo: 1500 vivos y una lápida en medio, de hace más de 180 días.
    core.write(recs(1, 1000), NOW)
    core.write([rec(5000, 1)], NOW)
    core.write(recs(1001, 500), NOW)
    const before = core.read(0)
    const staleSince = 500
    const upToDate = setup.store.meta()?.seq ?? 0
    // Lo reciente: una lápida que todavía no toca podar.
    const later = NOW + TOMBSTONE_KEEP_MS
    core.write([rec(6000, 1)], later)
    const prunedAt = NOW + TOMBSTONE_KEEP_MS + PRUNE_EVERY_MS
    expect(core.touch(prunedAt)).toBe(prunedAt + ROOM_IDLE_MS)
    return { ...setup, before, staleSince, upToDate }
  }

  test('las lápidas de más de 180 días se podan; las recientes y lo vivo se quedan', async () => {
    const { store } = await pruned()
    const all = store.recordsAfter(0, 5000)
    expect(all.some((r) => r.k === key(5000))).toBe(false)
    expect(all.some((r) => r.k === key(6000))).toBe(true)
    expect(all).toHaveLength(1501)
    expect(store.meta()?.count).toBe(1501)
    expect(store.meta()?.floor).toBe(1001)
  })

  test('quien venga de antes de lo podado recibe todo con `reset`, por páginas y sin volver a empezar', async () => {
    const { core, staleSince } = await pruned()
    const one = core.read(staleSince)
    expect(one.reset).toBe(true)
    expect(one.more).toBe(true)
    const two = core.read(one.seq)
    expect(two.reset).toBe(false)
    expect(two.more).toBe(false)
    const keys = new Set([...one.recs, ...two.recs].map((r) => r.k))
    expect(keys.size).toBe(1501)
  })

  test('quien estaba al día no recibe `reset`, solo lo que cambió de sitio', async () => {
    const { core, upToDate } = await pruned()
    const page = core.read(upToDate)
    expect(page.reset).toBe(false)
    expect(new Set(page.recs.map((r) => r.k)).size).toBe(page.recs.length)
  })

  test('no se poda más de una vez cada 30 días', async () => {
    const { core, store } = await room()
    core.write([rec(1, 1)], NOW)
    expect(core.touch(NOW + TOMBSTONE_KEEP_MS)).not.toBeNull()
    expect(store.recordsAfter(0, 10)).toHaveLength(1)
    // Pasó un día pero no 30 desde la última poda.
    core.touch(NOW + TOMBSTONE_KEEP_MS + DAY)
    expect(store.recordsAfter(0, 10)).toHaveLength(1)
    core.touch(NOW + TOMBSTONE_KEEP_MS + PRUNE_EVERY_MS)
    expect(store.recordsAfter(0, 10)).toHaveLength(0)
    expect(store.meta()).toMatchObject({ count: 0, floor: 1 })
  })

  test('`destroy` lo borra todo', async () => {
    const { core } = await room()
    core.destroy()
    expect(core.exists()).toBe(false)
  })
})
