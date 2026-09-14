import type { IsoDate, ReminderDraft } from '../types'
import { addDays, isValidTime, isoOfInstant, toInstant, toIso } from './date'
import type { ParsedTask } from './parse'
import { draftLabel } from './parse'
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

/**
 * Tareas que devuelve la IA del servidor, validadas otra vez en el móvil (la hora local solo
 * la conoce el móvil). `null` si no hay nada aprovechable: entonces se usa el analizador local.
 */
export function draftsFromInterpreted(raw: unknown, now: number): ParsedTask[] | null {
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
    const isDefault = time !== null && reminders.length === 0
    if (isDefault) reminders.push({ kind: 'before', minutes: 0 })

    return [{ title, date, time, reminders, label: draftLabel(date, time, reminders, isDefault, now) }]
  })

  return drafts.length ? drafts : null
}
