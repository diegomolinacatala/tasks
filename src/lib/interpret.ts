import type { IsoDate, Place, PlaceTrigger, ReminderDraft } from '../types'
import { addDays, isValidTime, isoOfInstant, toInstant, toIso } from './date'
import { normalizeDuration } from './duration'
import type { ParsedTask } from './parse'
import { draftLabel, hasHerePhrase, parseSpoken, withPlaceLabel } from './parse'
import { MAX_PLACE_NAME, matchPlace, placeKey, placeTriggerLabel } from './places'
import { DEFAULT_HERE_RADIUS, MAX_BEFORE_MINUTES, MAX_REMINDERS } from './reminders'

const lowerFirst = (text: string) => text.charAt(0).toLowerCase() + text.slice(1)

/** Lo que la IA puede devolver como "lugar" cuando se dijo "de aquí". */
const HERE_NAMES = new Set(['aqui', 'aca', 'donde estoy', 'here'])

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
 * El servidor solo dice el nombre del lugar; aquí se empareja con los guardados (`places`), también
 * por sus otros nombres y con alguna letra cambiada en la transcripción.
 * `null` = sin avisos por lugar en esta plataforma: el lugar se ignora.
 *
 * `text`: lo dicho. La IA no sabe de plazos ("esta semana", "hasta el viernes"): si lo dicho trae uno y
 * es una sola tarea, el plazo lo pone el analizador del móvil.
 */
export function draftsFromInterpreted(raw: unknown, now: number, places: readonly Place[] | null = [], text?: string): ParsedTask[] | null {
  if (!Array.isArray(raw)) return null
  const today = isoOfInstant(now)
  const spoken = text && raw.length === 1 ? parseSpoken(text, now, places) : null
  const period = spoken?.date && spoken.until ? { date: spoken.date, until: spoken.until } : null

  const drafts = raw.slice(0, MAX_TASKS).flatMap((item: unknown): ParsedTask[] => {
    if (!isObject(item) || typeof item.title !== 'string') return []
    // "Aquí" nunca es un lugar: si lo dicho era "al moverme", el aviso lo pone el analizador del móvil; con
    // varias tareas (sin análisis local) vale lo que la IA dijo de esta: salir de "aquí" es alejarse.
    const said = placeOf(item.place)
    const saidHere = said !== null && HERE_NAMES.has(placeKey(said.name))
    const spokenHere =
      spoken?.reminders.find((reminder) => reminder.kind === 'here') ??
      (saidHere && said.on === 'leave' && places !== null ? ({ kind: 'here', radius: DEFAULT_HERE_RADIUS, from: null, since: now } as const) : undefined)
    const heard = said && (spokenHere || saidHere) ? null : said
    const rawTitle = item.title.replace(/\s+/g, ' ').trim().slice(0, MAX_TITLE)
    // Sin lugares en esta plataforma (la PWA) el lugar no se tira: se queda dicho en el título.
    const title = places === null && heard && rawTitle ? `${rawTitle} (${lowerFirst(placeTriggerLabel(heard.name, heard.on))})` : rawTitle
    if (!title) return []

    const time = isValidTime(item.time) ? item.time : null
    let date = period?.date ?? (isRealDate(item.date) ? item.date : null)
    // Misma regla que el analizador local: hora sin día → hoy si no ha pasado, si no mañana.
    if (time && !date) date = toInstant(today, time) > now ? today : addDays(today, 1)

    const reminders = remindersOf(item.reminders, Boolean(date && time), now)
    // Sin día pero con un aviso a una hora concreta ("en 20 minutos"): la tarea es para ese día.
    const firstAt = reminders.find((reminder) => reminder.kind === 'at')
    if (!date && firstAt?.kind === 'at') date = isoOfInstant(firstAt.at)

    const duration = normalizeDuration(item.duration)
    const spokenPlace = places === null ? null : heard
    const saved = spokenPlace ? matchPlace(places ?? [], spokenPlace.name) : null
    if (spokenPlace && saved) reminders.push({ kind: 'place', placeId: saved.id, on: spokenPlace.on })
    // La IA tampoco sabe de "al moverme": si lo dicho lo trae, lo pone el analizador del móvil (y su
    // título, si el de la IA se quedó con la frase).
    if (spokenHere) reminders.push(spokenHere)
    const isDefault = time !== null && reminders.length === 0 && !spokenPlace
    if (isDefault) reminders.push({ kind: 'before', minutes: 0 })

    // Si el título de la IA aún lleva "al moverme…", no entendió el aviso: vale el título del móvil.
    const kept = spokenHere && spoken && hasHerePhrase(title) ? spoken.title : title
    const draft = { title: kept, date, ...(period ? { until: period.until } : {}), time, duration, reminders }
    const label = draftLabel(draft, isDefault, now, places ?? [])
    if (!spokenPlace || saved) return [{ ...draft, label }]
    return [{ ...draft, label: withPlaceLabel(label, spokenPlace), newPlace: spokenPlace }]
  })

  return drafts.length ? drafts : null
}
