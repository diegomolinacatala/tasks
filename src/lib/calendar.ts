import type { CalendarSettings, IsoDate } from '../types'
import { addDays, addMonths, formatTime, fromIso, isoOfInstant, startOfMonth } from './date'
import { spanLabel } from './duration'
import { compareNames, compareText } from './order'

/**
 * El calendario del iPhone (iCloud, Google, Outlook… todo lo que tenga en Ajustes → Calendario) dentro
 * del día: sus eventos salen en el horario, junto a las tareas, y los de todo el día encima. Solo se
 * leen, en el propio iPhone (EventKit): nada se guarda en el estado de la app ni sale del dispositivo.
 * Aquí, lo que se puede probar sin iPhone: validar lo que llega de Swift y repartirlo por días.
 */

/** Una ocurrencia de un evento. Las de un evento que se repite comparten `id` y se distinguen por `start`. */
export interface CalendarEvent {
  /** Único por ocurrencia: `id` más su inicio. */
  key: string
  /** El de EventKit (`eventIdentifier`), para abrirlo. */
  id: string
  calendarId: string
  title: string
  /** Epoch ms. */
  start: number
  /** Epoch ms; igual a `start` si no dura nada. */
  end: number
  allDay: boolean
  /** `#rrggbb`, el del calendario en el iPhone. La app lo apaga para que case con el papel (`.cal-tone`). */
  color: string
  location: string | null
}

/** De dónde sale un calendario: los suscritos son los de festivos o un enlace .ics. */
export type CalendarKind = 'calendar' | 'subscribed' | 'birthdays'

export interface CalendarInfo {
  id: string
  title: string
  color: string
  /** La cuenta que lo trae: "iCloud", "Gmail", "Exchange"… Vacía para los del propio iPhone. */
  source: string
  kind: CalendarKind
  /** Se pueden añadir eventos (los suscritos y los cumpleaños, no). */
  writable: boolean
  /** El «Tasks» que creó la app para las tareas: no se enseña entre los tuyos. */
  own: boolean
}

/** El permiso de iOS: aún sin pedir, concedido o negado (también "solo añadir", que no deja leer). */
export type CalendarStatus = 'prompt' | 'granted' | 'denied'

/** Lo que se pide a la vez: un mes y pico de una agenda muy llena cabe de sobra. */
export const MAX_EVENTS = 800
/** Calendarios ocultos que se recuerdan: más que los que tiene nadie. */
export const MAX_HIDDEN = 100
const MAX_TITLE = 200
const DAY_MINUTES = 24 * 60
const HEX = /^#[0-9a-f]{6}$/i
/** Si un calendario llega sin color: un gris tostado que no desentona. */
export const FALLBACK_COLOR = '#8c7b66'

export const defaultCalendarSettings = (): CalendarSettings => ({ enabled: false, hidden: [], export: null })

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null
const text = (value: unknown, max: number): string => (typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, max) : '')
const color = (value: unknown): string => (typeof value === 'string' && HEX.test(value) ? value.toLowerCase() : FALLBACK_COLOR)
const instant = (value: unknown): number | null => (typeof value === 'number' && Number.isFinite(value) ? value : null)

export function parseCalendarStatus(raw: unknown): CalendarStatus {
  return raw === 'granted' || raw === 'prompt' ? raw : 'denied'
}

/** Lo que llega de EventKit, validado: sin título no hay nada que enseñar; sin fechas, tampoco. */
export function parseCalendarEvents(raw: unknown): CalendarEvent[] {
  if (!Array.isArray(raw)) return []
  const events: CalendarEvent[] = []
  const seen = new Set<string>()
  for (const item of raw) {
    if (events.length >= MAX_EVENTS) break
    if (!isObject(item)) continue
    const id = text(item.id, 300)
    const start = instant(item.start)
    const end = instant(item.end)
    if (!id || start === null || end === null) continue
    const key = `${id}@${start}`
    if (seen.has(key)) continue
    seen.add(key)
    const location = text(item.location, MAX_TITLE)
    events.push({
      key,
      id,
      calendarId: text(item.calendarId, 300),
      title: text(item.title, MAX_TITLE),
      start,
      end: Math.max(start, end),
      allDay: item.allDay === true,
      color: color(item.color),
      location: location || null,
    })
  }
  return events
}

export function parseCalendars(raw: unknown): CalendarInfo[] {
  if (!Array.isArray(raw)) return []
  return raw.flatMap((item): CalendarInfo[] => {
    if (!isObject(item)) return []
    const id = text(item.id, 300)
    const title = text(item.title, MAX_TITLE)
    if (!id || !title) return []
    const kind: CalendarKind = item.kind === 'subscribed' || item.kind === 'birthdays' ? item.kind : 'calendar'
    return [{ id, title, color: color(item.color), source: text(item.source, MAX_TITLE), kind, writable: item.writable === true, own: item.own === true }]
  })
}

/** Los ocultos de una copia o de un estado roto: textos, sin repetir y con tope. */
export function normalizeCalendarSettings(raw: unknown): CalendarSettings {
  if (!isObject(raw)) return defaultCalendarSettings()
  const hidden = Array.isArray(raw.hidden) ? raw.hidden.filter((id): id is string => typeof id === 'string' && id.length > 0) : []
  const target = typeof raw.export === 'string' && raw.export.length > 0 ? raw.export.slice(0, 300) : null
  return { enabled: raw.enabled === true, hidden: [...new Set(hidden)].slice(0, MAX_HIDDEN), export: target }
}

/** Mostrar u ocultar un calendario. */
export function toggleHidden(hidden: readonly string[], id: string): string[] {
  return hidden.includes(id) ? hidden.filter((item) => item !== id) : [...hidden, id].slice(-MAX_HIDDEN)
}

/** Un evento ese día, en minutos desde su medianoche: lo que empezó antes empieza a las 0:00. */
export interface TimedEvent {
  event: CalendarEvent
  start: number
  end: number
}

export interface DayEvents {
  /** Los de todo el día, y los que lo cubren entero aunque tengan hora (un viaje de tres días). */
  allDay: CalendarEvent[]
  timed: TimedEvent[]
}

const minutesOfDay = (ms: number): number => {
  const date = new Date(ms)
  return date.getHours() * 60 + date.getMinutes()
}

/** Lo de un día, con la medianoche local (el cambio de hora incluido). */
export function eventsOfDay(events: readonly CalendarEvent[], day: IsoDate): DayEvents {
  const from = fromIso(day).getTime()
  const to = fromIso(addDays(day, 1)).getTime()
  const allDay: CalendarEvent[] = []
  const timed: TimedEvent[] = []
  for (const event of events) {
    const overlaps = event.end > event.start ? event.start < to && event.end > from : event.start >= from && event.start < to
    if (!overlaps) continue
    if (event.allDay || (event.start <= from && event.end >= to)) {
      allDay.push(event)
      continue
    }
    const start = event.start <= from ? 0 : minutesOfDay(event.start)
    const end = event.end >= to ? DAY_MINUTES : minutesOfDay(event.end)
    timed.push({ event, start, end: Math.max(start, end) })
  }
  allDay.sort((a, b) => a.start - b.start || compareNames(a.title, b.title))
  timed.sort((a, b) => a.start - b.start || a.end - b.end || compareText(a.event.key, b.event.key))
  return { allDay, timed }
}

/** `17:00–18:30` (`5:00–6:30 PM`), o solo la hora si no dura nada. */
export function eventSpan({ start, end }: Pick<TimedEvent, 'start' | 'end'>): string {
  const time = formatTime(Math.floor(start / 60), start % 60)
  return spanLabel(time, end > start ? end - start : null)
}

/**
 * Los días que se piden a EventKit para ver uno: su mes, con una semana por delante y dos por detrás
 * (la tira y el mes desplegado asoman a los meses vecinos). `to` no entra.
 */
export interface EventWindow {
  from: IsoDate
  to: IsoDate
}

export function eventWindow(day: IsoDate): EventWindow {
  return { from: addDays(startOfMonth(day), -7), to: addDays(startOfMonth(addMonths(startOfMonth(day), 1)), 14) }
}

export const windowCovers = (window: EventWindow | null, day: IsoDate): boolean =>
  window !== null && window.from <= day && day < window.to

/** Un evento largo no llena más que esto de puntos en la tira (un viaje de un mes es un error, no un plan). */
const MAX_MARKED_DAYS = 62

/** Los días con algo en el calendario: el punto de la tira y del mes. */
export function eventDays(events: readonly CalendarEvent[]): Set<IsoDate> {
  const days = new Set<IsoDate>()
  for (const event of events) {
    const last = isoOfInstant(event.end > event.start ? event.end - 1 : event.start)
    let day = isoOfInstant(event.start)
    for (let count = 0; day <= last && count < MAX_MARKED_DAYS; count += 1) {
      days.add(day)
      day = addDays(day, 1)
    }
  }
  return days
}

/** Los calendarios agrupados por su cuenta, como en la app Calendario. */
export function calendarGroups(calendars: readonly CalendarInfo[]): { source: string; calendars: CalendarInfo[] }[] {
  const groups = new Map<string, CalendarInfo[]>()
  for (const calendar of calendars) groups.set(calendar.source, [...(groups.get(calendar.source) ?? []), calendar])
  return [...groups]
    .sort(([a], [b]) => compareNames(a, b))
    .map(([source, items]) => ({ source, calendars: [...items].sort((a, b) => compareNames(a.title, b.title)) }))
}

/**
 * Calendarios que aparecieron desde la última vez (una cuenta de Google recién añadida en Ajustes). El
 * «Tasks» que crea la app no cuenta: es para las tareas, no un calendario tuyo.
 */
export function addedCalendars(before: readonly CalendarInfo[], after: readonly CalendarInfo[]): CalendarInfo[] {
  if (!before.length) return []
  const known = new Set(before.map((calendar) => calendar.id))
  return after.filter((calendar) => !known.has(calendar.id) && !calendar.own)
}

/** Evento para el widget de hoy (`WidgetEvent` en `WidgetStore.swift`). */
export interface WidgetEvent {
  id: string
  title: string
  start: number
  end: number
  allDay: boolean
  color: string
}

/** El widget enseña uno o dos; con esto sobran para una semana con la app cerrada. */
export const WIDGET_MAX_EVENTS = 60

export function widgetEvents(events: readonly CalendarEvent[], from: number, to: number): WidgetEvent[] {
  return events
    .filter((event) => event.end >= from && event.start < to)
    .sort((a, b) => a.start - b.start)
    .slice(0, WIDGET_MAX_EVENTS)
    .map(({ key, title, start, end, allDay, color }) => ({ id: key, title, start, end, allDay, color }))
}
