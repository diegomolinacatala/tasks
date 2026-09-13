import { pushData } from './message'
import type { Deps, DueItem, ItemKey } from './types'

/**
 * El plan gratuito permite 50 subpeticiones por invocación: 30 envíos más un puñado de
 * consultas a D1 dejan margen. Lo que no quepa sale al minuto siguiente.
 */
export const MAX_PER_RUN = 30
export const MAX_ATTEMPTS = 3
/** Un aviso que llega con más de una hora de retraso ya no ayuda: se descarta. */
export const LATE_MS = 60 * 60 * 1000
/** El cron corre al segundo 0: adelanta lo que vence dentro de ese minuto. */
export const LOOKAHEAD_MS = 30 * 1000
export const STALE_DEVICE_MS = 180 * 24 * 60 * 60 * 1000

export interface RunSummary {
  sent: number
  late: number
  retried: number
  dropped: number
  gone: number
  unauthorized: number
}

const keyOf = (item: DueItem): ItemKey => ({ deviceId: item.deviceId, id: item.id })

export async function runDue(deps: Deps): Promise<RunSummary> {
  const now = deps.now()
  const due = await deps.store.dueItems(now + LOOKAHEAD_MS, MAX_PER_RUN)

  const late = due.filter((item) => item.at < now - LATE_MS)
  const ready = due.filter((item) => item.at >= now - LATE_MS)

  const results = await Promise.all(
    ready.map(async (item) => ({ item, result: await deps.sender.send(item.subscription, pushData(item.payload)) })),
  )

  const goneDevices = new Set(results.filter(({ result }) => result === 'gone').map(({ item }) => item.deviceId))
  const finished = results.filter(({ result }) => result === 'sent' || result === 'rejected').map(({ item }) => item)
  const failed = results
    .filter(({ result }) => result === 'retry' || result === 'unauthorized')
    .map(({ item }) => item)
  const exhausted = failed.filter((item) => item.attempts + 1 >= MAX_ATTEMPTS)
  const retrying = failed.filter((item) => item.attempts + 1 < MAX_ATTEMPTS)

  await deps.store.deleteItems([...late, ...finished, ...exhausted].map(keyOf))
  await deps.store.bumpAttempts(retrying.map(keyOf))
  await deps.store.deleteDevices([...goneDevices])
  await deps.store.deleteStaleDevices(now - STALE_DEVICE_MS)

  return {
    sent: results.filter(({ result }) => result === 'sent').length,
    late: late.length,
    retried: retrying.length,
    dropped: exhausted.length + results.filter(({ result }) => result === 'rejected').length,
    gone: goneDevices.size,
    unauthorized: results.filter(({ result }) => result === 'unauthorized').length,
  }
}
