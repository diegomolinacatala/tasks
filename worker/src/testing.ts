import { dayIndex, dayOf, mondayIndex } from './stats'
import type {
  CellRow,
  CountRow,
  Deps,
  Device,
  DueItem,
  InterpretContext,
  Limiter,
  NewDevice,
  NewFeedback,
  PushResult,
  ScheduleItem,
  Sender,
  StatsSummary,
  Store,
  Subscription,
  TargetRow,
} from './types'

interface StoredDevice extends NewDevice {
  seenAt: number
}

interface StoredItem extends ScheduleItem {
  deviceId: string
  attempts: number
}

const between = (value: string, from: string, to: string) => value >= from && value <= to

/** `GROUP BY` de SQL: suma por clave lo que devuelve `pick` de cada fila. */
function sumBy<T>(rows: readonly T[], key: (row: T) => string, pick: (row: T) => number[]): Map<string, number[]> {
  const sums = new Map<string, number[]>()
  for (const row of rows) {
    const k = key(row)
    const values = pick(row)
    const previous = sums.get(k)
    sums.set(k, previous ? previous.map((n, i) => n + (values[i] ?? 0)) : values)
  }
  return sums
}

/** Las estadísticas en memoria: suman y agrupan como las consultas de `store.ts`. */
function memoryStats() {
  const counts = new Map<string, CountRow>()
  const cells = new Map<string, CellRow>()
  const targets = new Map<string, TargetRow>()
  const budget = new Map<string, number>()
  const byIp = new Map<string, number>()

  const add = <T>(map: Map<string, T>, key: string, row: T, merge: (a: T, b: T) => T) => {
    const previous = map.get(key)
    map.set(key, previous ? merge(previous, row) : row)
  }

  const store: Pick<Store, 'addStats' | 'statsSummary' | 'statsHeat' | 'deleteStatsBefore'> = {
    async addStats(rows, { day, max, ip, ipMax }) {
      const total = rows.counts.length + rows.cells.length + rows.targets.length
      if (!total) return true
      const ipKey = `${day}|${ip}`
      const fromIp = byIp.get(ipKey) ?? 0
      if (fromIp + total > ipMax) return false
      const spent = budget.get(day) ?? 0
      if (spent + total > max) return false
      byIp.set(ipKey, fromIp + total)
      budget.set(day, spent + total)
      for (const r of rows.counts) {
        add(counts, [r.day, r.platform, r.version, r.name].join('|'), r, (a, b) => ({
          ...a,
          events: a.events + b.events,
          devices: a.devices + b.devices,
        }))
      }
      for (const r of rows.cells) {
        add(cells, [r.week, r.version, r.screen, r.cell].join('|'), r, (a, b) => ({
          ...a,
          taps: a.taps + b.taps,
          rage: a.rage + b.rage,
          dead: a.dead + b.dead,
        }))
      }
      for (const r of rows.targets) {
        add(targets, [r.week, r.version, r.screen, r.target].join('|'), r, (a, b) => ({
          ...a,
          taps: a.taps + b.taps,
          rage: a.rage + b.rage,
          dead: a.dead + b.dead,
          slow: a.slow + b.slow,
        }))
      }
      return true
    },

    async statsSummary(query): Promise<StatsSummary> {
      const all = [...counts.values()]
      const versionOk = (r: CountRow) => query.version === null || r.version === query.version || r.version === ''
      const grouped = (from: string, to: string, prefixes: string[]) =>
        [
          ...sumBy(
            all.filter((r) => between(r.day, from, to) && prefixes.includes(r.name.slice(0, 2)) && versionOk(r)),
            (r) => r.name,
            (r) => [r.events, r.devices],
          ),
        ].map(([name, [events = 0, devices = 0]]): [string, number, number] => [name, events, devices])
      const cohortRows = all.filter((r) => between(r.day, query.cohortsFrom, query.to) && r.name.startsWith('c:'))
      return {
        daily: all
          .filter((r) => between(r.day, query.from, query.to) && r.name.startsWith('u:'))
          .map((r) => [r.day, r.platform, r.version, r.name, r.events, r.devices]),
        names: grouped(query.from, query.to, ['e:', 'd:', 'x:']),
        previous: grouped(query.previousFrom, query.previousTo, ['e:', 'x:']),
        cohorts: [
          ...sumBy(
            cohortRows,
            (r) => `${dayOf(mondayIndex(dayIndex(r.day) ?? 0))}|${r.name.slice(2)}`,
            (r) => [r.devices],
          ),
        ].map(([key, [devices = 0]]) => {
          const [week = '', cohort = ''] = key.split('|')
          return [week, cohort, devices]
        }),
        screens: [
          ...sumBy(
            [...targets.values()].filter((r) => between(r.week, query.weeksFrom, query.weeksTo)),
            (r) => `${r.version}|${r.screen}`,
            (r) => [r.taps],
          ),
        ].map(([key, [taps = 0]]) => {
          const [version = '', screen = ''] = key.split('|')
          return [version, screen, taps]
        }),
      }
    },

    async statsHeat(query) {
      const matches = (r: CellRow | TargetRow) =>
        between(r.week, query.from, query.to) && (query.version === null || r.version === query.version) && r.screen === query.screen
      const cellSums = sumBy([...cells.values()].filter(matches), (r) => String(r.cell), (r) => [r.taps, r.rage, r.dead])
      const targetSums = sumBy([...targets.values()].filter(matches), (r) => r.target, (r) => [r.taps, r.rage, r.dead, r.slow])
      return {
        cells: [...cellSums].map(([cell, [taps = 0, rage = 0, dead = 0]]): [number, number, number, number] => [
          Number(cell),
          taps,
          rage,
          dead,
        ]),
        targets: [...targetSums]
          .map(([target, [taps = 0, rage = 0, dead = 0, slow = 0]]): [string, number, number, number, number] => [
            target,
            taps,
            rage,
            dead,
            slow,
          ])
          .sort((a, b) => b[1] - a[1])
          .slice(0, 80),
      }
    },

    async deleteStatsBefore(day, today) {
      for (const [key, row] of counts) if (row.day < day) counts.delete(key)
      for (const [key, row] of cells) if (row.week < day) cells.delete(key)
      for (const [key, row] of targets) if (row.week < day) targets.delete(key)
      for (const key of budget.keys()) if (key < day) budget.delete(key)
      for (const key of byIp.keys()) if ((key.split('|')[0] ?? '') < today) byIp.delete(key)
    },
  }
  return { store, counts, cells, targets, budget, byIp }
}

/** Store en memoria con la misma semántica que D1, para los tests. */
export function memoryStore() {
  const devices = new Map<string, StoredDevice>()
  let items: StoredItem[] = []
  const feedback = new Map<string, NewFeedback>()
  const stats = memoryStats()

  const store: Store = {
    async countDevicesSince(ipHash, since) {
      return [...devices.values()].filter((d) => d.ipHash === ipHash && d.now >= since).length
    },
    async createDevice(device) {
      devices.set(device.id, { ...device, seenAt: device.now })
    },
    async findDevice(tokenHash): Promise<Device | null> {
      const found = [...devices.values()].find((d) => d.tokenHash === tokenHash)
      return found ? { id: found.id, subscription: found.subscription } : null
    },
    async touchDevice(id, now, subscription) {
      const device = devices.get(id)
      if (device) devices.set(id, { ...device, seenAt: now, subscription: subscription ?? device.subscription })
    },
    async replaceSchedule(deviceId, next) {
      items = [...items.filter((i) => i.deviceId !== deviceId), ...next.map((i) => ({ ...i, deviceId, attempts: 0 }))]
    },
    async deleteDevice(id) {
      devices.delete(id)
      items = items.filter((i) => i.deviceId !== id)
    },
    async deleteDevices(ids) {
      for (const id of ids) await store.deleteDevice(id)
    },
    async dueItems(until, limit): Promise<DueItem[]> {
      return items
        .flatMap((i) => {
          const subscription = devices.get(i.deviceId)?.subscription
          return i.at <= until && subscription ? [{ ...i, subscription }] : []
        })
        .sort((a, b) => a.at - b.at)
        .slice(0, limit)
    },
    async deleteItems(keys) {
      items = items.filter((i) => !keys.some((k) => k.deviceId === i.deviceId && k.id === i.id))
    },
    async bumpAttempts(keys, retryAt) {
      items = items.map((i) =>
        keys.some((k) => k.deviceId === i.deviceId && k.id === i.id) ? { ...i, attempts: i.attempts + 1, at: retryAt } : i,
      )
    },
    async nextDueAt() {
      return items.length ? Math.min(...items.map((i) => i.at)) : null
    },
    async deleteStaleDevices(seenBefore) {
      for (const [id, device] of devices) if (device.seenAt < seenBefore) await store.deleteDevice(id)
    },
    async countFeedback() {
      return feedback.size
    },
    async countFeedbackSince(ipHash, since) {
      return [...feedback.values()].filter((f) => f.ipHash === ipHash && f.at >= since).length
    },
    async addFeedback(item) {
      feedback.set(item.id, item)
    },
    async listFeedback(limit) {
      return [...feedback.values()]
        .sort((a, b) => b.at - a.at)
        .slice(0, limit)
        .map(({ id, at, message, context, shot }) => ({ id, at, message, context, hasShot: shot !== null }))
    },
    async feedbackShot(id) {
      return feedback.get(id)?.shot ?? null
    },
    async deleteFeedback(id) {
      feedback.delete(id)
    },
    async deleteFeedbackBefore(at) {
      for (const [id, item] of feedback) if (item.at < at) feedback.delete(id)
    },
    ...stats.store,
  }

  return { store, devices, items: () => items, feedback, stats }
}

export interface SentMessage {
  subscription: Subscription
  data: string
}

export function fakeSender(respond: (message: SentMessage) => PushResult = () => 'sent') {
  const sent: SentMessage[] = []
  const sender: Sender = {
    async send(subscription, data) {
      const message = { subscription, data }
      sent.push(message)
      return respond(message)
    },
  }
  return { sender, sent }
}

export const subscription = (endpoint = 'https://web.push.apple.com/QWxhZGRpbjpvcGVu'): Subscription => ({
  endpoint,
  keys: { p256dh: 'B'.repeat(87), auth: 'a'.repeat(22) },
})

/** Límite en memoria: `max` permisos por clave, sin ventana temporal. */
export function countingLimiter(max = Number.POSITIVE_INFINITY) {
  const counts = new Map<string, number>()
  const limiter: Limiter = {
    async allow(key) {
      const next = (counts.get(key) ?? 0) + 1
      counts.set(key, next)
      return next <= max
    },
  }
  return { limiter, counts }
}

/** Clave del buzón en los tests. */
export const FEEDBACK_KEY = 'clave-del-buzon-de-pruebas-0123456789'

export function testDeps(overrides: Partial<Deps> = {}) {
  const memory = memoryStore()
  const push = fakeSender()
  let clock = Date.UTC(2026, 8, 11, 8, 0, 0)
  const armed: number[] = []
  const transcribed: string[] = []
  const languages: string[] = []
  const interpreted: { text: string; context: InterpretContext }[] = []
  const deps: Deps = {
    store: memory.store,
    sender: push.sender,
    scheduler: { arm: async (at) => void armed.push(at) },
    limits: {
      ip: countingLimiter().limiter,
      device: countingLimiter().limiter,
      voice: countingLimiter().limiter,
      stats: countingLimiter().limiter,
    },
    interpreter: {
      interpret: async (text, context) => {
        interpreted.push({ text, context })
        return [{ title: 'Llamar a Miguel', date: context.today, time: '17:00', reminders: [{ kind: 'before', minutes: 10 }] }]
      },
    },
    transcriber: {
      transcribe: async (audio, language) => {
        transcribed.push(audio)
        languages.push(language)
        return 'llamar a miguel'
      },
    },
    config: {
      allowedOrigins: ['https://diegomolinacatala.github.io'],
      vapidPublicKey: 'PUBLIC',
      ipSalt: 'salt',
      feedbackKey: FEEDBACK_KEY,
    },
    now: () => clock,
    ...overrides,
  }
  return { deps, memory, push, armed, transcribed, languages, interpreted, setNow: (ms: number) => (clock = ms), now: () => clock }
}
