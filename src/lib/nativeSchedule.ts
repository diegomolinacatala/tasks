import type { AppState, PlaceTrigger } from '../types'
import { isoOfInstant } from './date'
import { placeAlerts } from './places'
import type { ScheduleEntry } from './schedule'
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
/** Aviso de una tarea de un día anterior: además, "Pasar a hoy". */
export const OVERDUE_CATEGORY = 'task-overdue'
/** Resumen diario con algo atrasado: "Pasar atrasadas a hoy". */
export const DIGEST_CATEGORY = 'digest-overdue'
/** Aviso al acabar una tarea que dura: "Sí, hecha" y "Todavía no". */
export const ASK_CATEGORY = 'task-ask'
/** Aviso de una rutina: "Hecha", que la tacha sin abrir la app (`NotificationResponder.swift`). */
export const ROUTINE_CATEGORY = 'routine'

export type NotificationCategory =
  | typeof TASK_CATEGORY
  | typeof OVERDUE_CATEGORY
  | typeof DIGEST_CATEGORY
  | typeof ASK_CATEGORY
  | typeof ROUTINE_CATEGORY
/** Evento de `window` que obliga a reprogramar todo aunque el plan no haya cambiado. */
export const RESCHEDULE_EVENT = 'tasks:reschedule'

export interface TimedNotification {
  id: number
  at: number
  title: string
  body: string
  /**
   * Solo texto: viaja por el `userInfo` de iOS. `taskId` vacío = resumen diario o rutina; `ask` =
   * "1"; `routineId` y `day` (`AAAA-MM-DD`), la rutina y el día que toca.
   */
  extra: { taskId: string; entryId: string; ask?: string; routineId?: string; day?: string }
  category?: NotificationCategory
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

/** Botones del aviso: los de tarea, con "Pasar a hoy" si es atrasada; el resumen, solo si hay atrasadas. */
function categoryOf(entry: ScheduleEntry): NotificationCategory | undefined {
  if (entry.ask) return ASK_CATEGORY
  if (entry.routine) return ROUTINE_CATEGORY
  if (entry.taskId) return entry.overdue ? OVERDUE_CATEGORY : TASK_CATEGORY
  return entry.overdue ? DIGEST_CATEGORY : undefined
}

/**
 * Parte del hueco que se pueden llevar las rutinas si hacen falta sitios para lo demás: cada una
 * programa una semana por delante y, con varias diarias, dejarían sin sitio los recordatorios de las
 * tareas. Lo que no cabe se programa al volver a abrir la app.
 */
export const ROUTINE_SHARE = 1 / 3

/** Lo más próximo de cada clase dentro de `slots`, sin que las rutinas se coman el hueco de lo demás. */
export function fitSchedule(entries: readonly ScheduleEntry[], slots: number): ScheduleEntry[] {
  const routines = entries.filter((entry) => entry.routine)
  const others = entries.filter((entry) => !entry.routine)
  const routineSlots = Math.min(routines.length, Math.max(slots - others.length, Math.floor(slots * ROUTINE_SHARE)))
  return [...others.slice(0, Math.max(0, slots - routineSlots)), ...routines.slice(0, routineSlots)].sort((a, b) => a.at - b.at)
}

/** Qué debe tener programado el iPhone ahora: regiones primero y, con el hueco que dejan, lo más próximo. */
export function nativePlan(state: AppState, now: number): NativePlan {
  const alerts = placeAlerts(state, isoOfInstant(now))
  const entries = fitSchedule(upcomingSchedule(state, now), MAX_PENDING - alerts.length)

  const timedIds = new Set<number>()
  const timed = entries.map((entry): TimedNotification => {
    const id = numericId(entry.id, 1, PLACE_ID_BASE - 1, timedIds)
    timedIds.add(id)
    const extra = {
      taskId: entry.taskId ?? '',
      entryId: entry.id,
      ...(entry.ask ? { ask: '1' } : {}),
      ...(entry.routine ? { routineId: entry.routine.id, day: entry.routine.date } : {}),
    }
    const base = { id, at: entry.at, title: entry.title, body: entry.body, extra }
    const category = categoryOf(entry)
    return category ? { ...base, category } : base
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
