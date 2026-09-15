import type { Deps, Device, DueItem, InterpretContext, Limiter, NewDevice, PushResult, ScheduleItem, Sender, Store, Subscription } from './types'

interface StoredDevice extends NewDevice {
  seenAt: number
}

interface StoredItem extends ScheduleItem {
  deviceId: string
  attempts: number
}

/** Store en memoria con la misma semántica que D1, para los tests. */
export function memoryStore() {
  const devices = new Map<string, StoredDevice>()
  let items: StoredItem[] = []

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
  }

  return { store, devices, items: () => items }
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

export function testDeps(overrides: Partial<Deps> = {}) {
  const memory = memoryStore()
  const push = fakeSender()
  let clock = Date.UTC(2026, 8, 11, 8, 0, 0)
  const armed: number[] = []
  const transcribed: string[] = []
  const interpreted: { text: string; context: InterpretContext }[] = []
  const deps: Deps = {
    store: memory.store,
    sender: push.sender,
    scheduler: { arm: async (at) => void armed.push(at) },
    limits: { ip: countingLimiter().limiter, device: countingLimiter().limiter, voice: countingLimiter().limiter },
    interpreter: {
      interpret: async (text, context) => {
        interpreted.push({ text, context })
        return [{ title: 'Llamar a Miguel', date: context.today, time: '17:00', reminders: [{ kind: 'before', minutes: 10 }] }]
      },
    },
    transcriber: {
      transcribe: async (audio) => {
        transcribed.push(audio)
        return 'llamar a miguel'
      },
    },
    config: { allowedOrigins: ['https://diegomolinacatala.github.io'], vapidPublicKey: 'PUBLIC', ipSalt: 'salt' },
    now: () => clock,
    ...overrides,
  }
  return { deps, memory, push, armed, transcribed, interpreted, setNow: (ms: number) => (clock = ms), now: () => clock }
}
