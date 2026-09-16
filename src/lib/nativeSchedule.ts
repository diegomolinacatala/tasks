import type { AppState, PlaceTrigger } from '../types'
import { isoOfInstant } from './date'
import { placeAlerts } from './places'
import { upcomingSchedule } from './schedule'

/** iOS guarda como mucho 64 notificaciones locales pendientes por app, las de lugar incluidas. */
export const MAX_PENDING = 64
/**
 * El plugin de notificaciones exige ids numéricos de 32 bits. Por debajo de esta cifra van los
 * avisos por hora; desde aquí, los de lugar. Así cada lado puede limpiar los suyos sin tocar los otros.
 */
export const PLACE_ID_BASE = 1_000_000_000
const ID_LIMIT = 2_147_483_647
/** Categoría con los botones "Hecha" y "+10 min". */
export const TASK_CATEGORY = 'task'
/** Evento de `window` que obliga a reprogramar todo aunque el plan no haya cambiado. */
export const RESCHEDULE_EVENT = 'tasks:reschedule'

export interface TimedNotification {
  id: number
  at: number
  title: string
  body: string
  /** Solo texto: viaja por el `userInfo` de iOS. `taskId` vacío = resumen diario. */
  extra: { taskId: string; entryId: string }
  category?: typeof TASK_CATEGORY
}

export interface PlaceNotification {
  id: number
  lat: number
  lng: number
  radius: number
  on: PlaceTrigger
  title: string
  body: string
  /** `taskIds` separados por comas. */
  extra: { placeId: string; on: PlaceTrigger; taskIds: string }
  category?: typeof TASK_CATEGORY
}

export interface NativePlan {
  timed: TimedNotification[]
  places: PlaceNotification[]
}

/** FNV-1a de 32 bits: el mismo aviso conserva su id entre sincronizaciones. */
function hash(key: string): number {
  let value = 0x811c9dc5
  for (let i = 0; i < key.length; i++) {
    value ^= key.charCodeAt(i)
    value = Math.imul(value, 0x01000193)
  }
  return value >>> 0
}

/** Id en `[base, base + span)` que no esté ya en `taken`. */
export function numericId(key: string, base: number, span: number, taken: ReadonlySet<number>): number {
  const start = hash(key) % span
  for (let offset = 0; offset < span; offset++) {
    const id = base + ((start + offset) % span)
    if (!taken.has(id)) return id
  }
  throw new Error('Sin ids libres para las notificaciones.')
}

export const isPlaceNotification = (id: number) => id >= PLACE_ID_BASE

/** Qué debe tener programado el iPhone ahora: regiones primero y, con el hueco que dejan, lo más próximo. */
export function nativePlan(state: AppState, now: number): NativePlan {
  const alerts = placeAlerts(state, isoOfInstant(now))
  const entries = upcomingSchedule(state, now, MAX_PENDING - alerts.length)

  const timedIds = new Set<number>()
  const timed = entries.map((entry): TimedNotification => {
    const id = numericId(entry.id, 1, PLACE_ID_BASE - 1, timedIds)
    timedIds.add(id)
    const base = { id, at: entry.at, title: entry.title, body: entry.body, extra: { taskId: entry.taskId ?? '', entryId: entry.id } }
    return entry.taskId ? { ...base, category: TASK_CATEGORY } : base
  })

  const placeIds = new Set<number>()
  const places = alerts.map((alert): PlaceNotification => {
    const id = numericId(alert.key, PLACE_ID_BASE, ID_LIMIT - PLACE_ID_BASE, placeIds)
    placeIds.add(id)
    const base = {
      id,
      lat: alert.lat,
      lng: alert.lng,
      radius: alert.radius,
      on: alert.on,
      title: alert.title,
      body: alert.body,
      extra: { placeId: alert.placeId, on: alert.on, taskIds: alert.taskIds.join(',') },
    }
    return alert.taskIds.length === 1 ? { ...base, category: TASK_CATEGORY } : base
  })

  return { timed, places }
}

/** Huella del plan: si no cambia, no hace falta volver a programar nada. */
export const planFingerprint = (plan: NativePlan) => JSON.stringify(plan)
