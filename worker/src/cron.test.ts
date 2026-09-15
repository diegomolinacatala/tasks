import { describe, expect, test } from 'vitest'
import {
  LATE_MS,
  LOOKAHEAD_MS,
  MAX_ATTEMPTS,
  MAX_PER_RUN,
  RETRY_DELAY_MS,
  STALE_DEVICE_MS,
  planNext,
  runDue,
} from './cron'
import { fakeSender, subscription, testDeps } from './testing'
import type { PushResult } from './types'

function setup(respond?: (endpoint: string) => PushResult) {
  const context = testDeps()
  const push = fakeSender((message) => respond?.(message.subscription.endpoint) ?? 'sent')
  const deps = { ...context.deps, sender: push.sender }
  const addDevice = (id: string) =>
    deps.store.createDevice({
      id,
      tokenHash: `h-${id}`,
      subscription: subscription(`https://web.push.apple.com/${id}`),
      ipHash: 'ip',
      now: context.now(),
    })
  return { ...context, deps, push, addDevice }
}

describe('runDue', () => {
  test('envía lo vencido (y lo que vence en este minuto) y lo borra', async () => {
    const { deps, memory, push, addDevice, now } = setup()
    await addDevice('d1')
    await deps.store.replaceSchedule('d1', [
      { id: 'ya', at: now() - 1000, payload: 'eA' },
      { id: 'casi', at: now() + LOOKAHEAD_MS, payload: 'eQ' },
      { id: 'luego', at: now() + 5 * 60_000, payload: 'eg' },
    ])

    const summary = await runDue(deps)

    expect(summary.sent).toBe(2)
    expect(push.sent.map((m) => JSON.parse(m.data).p)).toEqual(['eA', 'eQ'])
    expect(memory.items().map((i) => i.id)).toEqual(['luego'])
  })

  test('descarta sin enviar lo que llega con más de una hora de retraso', async () => {
    const { deps, memory, push, addDevice, now } = setup()
    await addDevice('d1')
    await deps.store.replaceSchedule('d1', [{ id: 'viejo', at: now() - LATE_MS - 1, payload: 'eA' }])

    expect(await runDue(deps)).toMatchObject({ sent: 0, late: 1 })
    expect(push.sent).toHaveLength(0)
    expect(memory.items()).toEqual([])
  })

  test('reintenta fallos transitorios hasta el máximo', async () => {
    const { deps, memory, addDevice, now, setNow } = setup(() => 'retry')
    await addDevice('d1')
    await deps.store.replaceSchedule('d1', [{ id: 'a', at: now(), payload: 'eA' }])

    for (let attempt = 1; attempt < MAX_ATTEMPTS; attempt++) {
      expect((await runDue(deps)).retried).toBe(1)
      expect(memory.items()[0]!).toMatchObject({ attempts: attempt, at: now() + RETRY_DELAY_MS })
      setNow(now() + RETRY_DELAY_MS)
    }
    expect((await runDue(deps)).dropped).toBe(1)
    expect(memory.items()).toEqual([])
  })

  test('un reintento se aplaza sin retrasar los avisos que vienen justo detrás', async () => {
    const { deps, addDevice, now } = setup((endpoint) => (endpoint.endsWith('caido') ? 'retry' : 'sent'))
    await addDevice('caido')
    await addDevice('d1')
    await deps.store.replaceSchedule('caido', [{ id: 'a', at: now(), payload: 'eA' }])
    await deps.store.replaceSchedule('d1', [{ id: 'b', at: now() + 5000, payload: 'eA' }])

    const summary = await runDue(deps)

    expect(await deps.store.nextDueAt()).toBe(now() + 5000)
    expect(planNext(await deps.store.nextDueAt(), now(), summary)).toBe(now() + 5000)
  })

  test('borra el dispositivo cuya suscripción ya no existe', async () => {
    const { deps, memory, addDevice, now } = setup((endpoint) => (endpoint.endsWith('muerto') ? 'gone' : 'sent'))
    await addDevice('vivo')
    await addDevice('muerto')
    await deps.store.replaceSchedule('vivo', [{ id: 'a', at: now(), payload: 'eA' }])
    await deps.store.replaceSchedule('muerto', [
      { id: 'b', at: now(), payload: 'eA' },
      { id: 'c', at: now() + 3_600_000, payload: 'eA' },
    ])

    expect(await runDue(deps)).toMatchObject({ sent: 1, gone: 1 })
    expect(memory.devices.has('muerto')).toBe(false)
    expect(memory.items()).toEqual([])
  })

  test('un VAPID rechazado nunca borra el dispositivo: se reintenta y se informa', async () => {
    const { deps, memory, addDevice, now } = setup(() => 'unauthorized')
    await addDevice('d1')
    await deps.store.replaceSchedule('d1', [{ id: 'a', at: now(), payload: 'eA' }])

    expect(await runDue(deps)).toMatchObject({ unauthorized: 1, retried: 1, gone: 0 })
    expect(memory.devices.has('d1')).toBe(true)
    expect(memory.items()[0]!.attempts).toBe(1)
  })

  test('los rechazos definitivos descartan el aviso pero conservan el dispositivo', async () => {
    const { deps, memory, addDevice, now } = setup(() => 'rejected')
    await addDevice('d1')
    await deps.store.replaceSchedule('d1', [{ id: 'a', at: now(), payload: 'eA' }])

    expect((await runDue(deps)).dropped).toBe(1)
    expect(memory.items()).toEqual([])
    expect(memory.devices.has('d1')).toBe(true)
  })

  test('respeta el máximo por ejecución', async () => {
    const { deps, memory, addDevice, now } = setup()
    await addDevice('d1')
    const items = Array.from({ length: MAX_PER_RUN + 5 }, (_, i) => ({ id: `i${i}`, at: now() - i, payload: 'eA' }))
    await deps.store.replaceSchedule('d1', items)

    expect((await runDue(deps)).sent).toBe(MAX_PER_RUN)
    expect(memory.items()).toHaveLength(5)
  })

  test('limpia dispositivos abandonados', async () => {
    const { deps, memory, addDevice, setNow, now } = setup()
    await addDevice('viejo')
    setNow(now() + STALE_DEVICE_MS + 1)
    await runDue(deps)
    expect(memory.devices.has('viejo')).toBe(false)
  })
})

describe('planNext', () => {
  const NOW = 1_000_000
  const idle = { sent: 0, late: 0, retried: 0, dropped: 0, gone: 0, unauthorized: 0 }

  test('sin pendientes no programa nada', () => {
    expect(planNext(null, NOW, idle)).toBeNull()
  })

  test('el próximo aviso futuro fija la alarma a su hora exacta', () => {
    expect(planNext(NOW + 90_000, NOW, idle)).toBe(NOW + 90_000)
  })

  test('si quedan vencidos por el tope, vuelve enseguida', () => {
    expect(planNext(NOW - 5, NOW, { ...idle, sent: MAX_PER_RUN })).toBe(NOW + LOOKAHEAD_MS)
  })

  test('si la ejecución falló, espera antes de volver', () => {
    expect(planNext(NOW - 5, NOW, { ...idle, failed: true })).toBe(NOW + RETRY_DELAY_MS)
  })

  test('los reintentos ya llevan su nueva hora: se sigue la del próximo pendiente', () => {
    expect(planNext(NOW + RETRY_DELAY_MS, NOW, { ...idle, retried: 1 })).toBe(NOW + RETRY_DELAY_MS)
  })
})

describe('nextDueAt (store en memoria)', () => {
  test('devuelve el mínimo o null', async () => {
    const { deps, addDevice, now } = setup()
    expect(await deps.store.nextDueAt()).toBeNull()
    await addDevice('d1')
    await deps.store.replaceSchedule('d1', [
      { id: 'a', at: now() + 50, payload: 'eA' },
      { id: 'b', at: now() + 10, payload: 'eA' },
    ])
    expect(await deps.store.nextDueAt()).toBe(now() + 10)
  })
})
