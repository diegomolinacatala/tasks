import type { IsoDate, Place, PlaceTrigger, ReminderDraft } from '../types'
import { addDays, isValidTime, isoOfInstant, toInstant, toIso } from './date'
import { normalizeDuration } from './duration'
import type { ParsedTask } from './parse'
import { draftLabel, withPlaceLabel } from './parse'
import { MAX_PLACE_NAME, findPlace } from './places'
import { MAX_BEFORE_MINUTES, MAX_REMINDERS } from './reminders'

const MAX_TASKS = 5
const MAX_TITLE = 200
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null

function isRealDate(value: unknown): value is IsoDate {
  if (typeof value !== 'string' || !DATE_RE.test(value)) return false
  const [y = 0, m = 1, d = 1] = value.split('-').map(Number)
  return toIso(new Date(y, m - 1, d)) === value
}

function remindersOf(raw: unknown, hasInstant: boolean, now: number): ReminderDraft[] {
  if (!Array.isArray(raw)) return []
  return raw.slice(0, MAX_REMINDERS).flatMap((item: unknown): ReminderDraft[] => {
    if (!isObject(item)) return []
    if (item.kind === 'before') {
      const { minutes } = item
      const valid =
        typeof minutes === 'number' && Number.isInteger(minutes) && minutes >= 0 && minutes <= MAX_BEFORE_MINUTES
      return valid && hasInstant ? [{ kind: 'before', minutes }] : []
    }
    if (item.kind === 'at' && isRealDate(item.date) && isValidTime(item.time)) {
      const at = toInstant(item.date, item.time)
      // Un aviso que ya pasó no sonaría nunca: mejor no crearlo.
      return at > now ? [{ kind: 'at', at }] : []
    }
    return []
  })
}

function placeOf(raw: unknown): { name: string; on: PlaceTrigger } | null {
  if (!isObject(raw) || typeof raw.name !== 'string' || (raw.on !== 'arrive' && raw.on !== 'leave')) return null
  const name = raw.name.replace(/\s+/g, ' ').trim().slice(0, MAX_PLACE_NAME)
  return name ? { name, on: raw.on } : null
}

/**
 * Tareas que devuelve la IA del servidor, validadas otra vez en el móvil (la hora local solo
 * la conoce el móvil). `null` si no hay nada aprovechable: entonces se usa el analizador local.
 * El servidor solo dice el nombre del lugar; aquí se empareja con los guardados (`places`).
 * `null` = sin avisos por lugar en esta plataforma: el lugar se ignora.
 */
export function draftsFromInterpreted(raw: unknown, now: number, places: readonly Place[] | null = []): ParsedTask[] | null {
  if (!Array.isArray(raw)) return null
  const today = isoOfInstant(now)

  const drafts = raw.slice(0, MAX_TASKS).flatMap((item: unknown): ParsedTask[] => {
    if (!isObject(item) || typeof item.title !== 'string') return []
    const title = item.title.replace(/\s+/g, ' ').trim().slice(0, MAX_TITLE)
    if (!title) return []

    const time = isValidTime(item.time) ? item.time : null
    let date = isRealDate(item.date) ? item.date : null
    // Misma regla que el analizador local: hora sin día → hoy si no ha pasado, si no mañana.
    if (time && !date) date = toInstant(today, time) > now ? today : addDays(today, 1)

    const reminders = remindersOf(item.reminders, Boolean(date && time), now)
    // Sin día pero con un aviso a una hora concreta ("en 20 minutos"): la tarea es para ese día.
    const firstAt = reminders.find((reminder) => reminder.kind === 'at')
    if (!date && firstAt?.kind === 'at') date = isoOfInstant(firstAt.at)

    const duration = normalizeDuration(item.duration)
    const spokenPlace = places === null ? null : placeOf(item.place)
    const saved = spokenPlace ? findPlace(places ?? [], spokenPlace.name) : null
    if (spokenPlace && saved) reminders.push({ kind: 'place', placeId: saved.id, on: spokenPlace.on })
    const isDefault = time !== null && reminders.length === 0 && !spokenPlace
    if (isDefault) reminders.push({ kind: 'before', minutes: 0 })

    const draft = { title, date, time, duration, reminders }
    const label = draftLabel(draft, isDefault, now, places ?? [])
    if (!spokenPlace || saved) return [{ ...draft, label }]
    return [{ ...draft, label: withPlaceLabel(label, spokenPlace), newPlace: spokenPlace }]
  })

  return drafts.length ? drafts : null
}
