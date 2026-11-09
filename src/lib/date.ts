import type { IsoDate, IsoTime } from '../types'
import { language, pick } from './i18n'

const MS_DAY = 86_400_000

const pad = (n: number) => String(n).padStart(2, '0')

export function toIso(date: Date): IsoDate {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

/** Interpreta el ISO en hora local (evita el desfase UTC de `new Date('YYYY-MM-DD')`). */
export function fromIso(iso: IsoDate): Date {
  const [y = 0, m = 1, d = 1] = iso.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function todayIso(now: Date = new Date()): IsoDate {
  return toIso(now)
}

export function addDays(iso: IsoDate, days: number): IsoDate {
  const date = fromIso(iso)
  date.setDate(date.getDate() + days)
  return toIso(date)
}

export function diffDays(from: IsoDate, to: IsoDate): number {
  return Math.round((fromIso(to).getTime() - fromIso(from).getTime()) / MS_DAY)
}

/** Lunes de la semana que contiene `iso`. */
export function startOfWeek(iso: IsoDate): IsoDate {
  const date = fromIso(iso)
  const shift = (date.getDay() + 6) % 7
  date.setDate(date.getDate() - shift)
  return toIso(date)
}

export function weekDays(iso: IsoDate): IsoDate[] {
  const monday = startOfWeek(iso)
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i))
}

/** Semanas que pinta un mes desplegado: seis caben siempre, y así no cambia de alto al pasar de mes. */
export const MONTH_WEEKS = 6

/** Día 1 del mes de `iso`. */
export const startOfMonth = (iso: IsoDate): IsoDate => `${iso.slice(0, 8)}01`

export const sameMonth = (a: IsoDate, b: IsoDate): boolean => a.slice(0, 7) === b.slice(0, 7)

/** El mismo día de otro mes; si ese mes es más corto, su último día (31 ene + 1 → 28 feb). */
export function addMonths(iso: IsoDate, months: number): IsoDate {
  const from = fromIso(iso)
  const target = new Date(from.getFullYear(), from.getMonth() + months, 1)
  const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate()
  target.setDate(Math.min(from.getDate(), lastDay))
  return toIso(target)
}

/** Lunes de las seis semanas del mes de `iso`, empezando por la que contiene el día 1. */
export function monthWeeks(iso: IsoDate): IsoDate[] {
  const first = startOfWeek(startOfMonth(iso))
  return Array.from({ length: MONTH_WEEKS }, (_, index) => addDays(first, index * 7))
}

/** Nombres fijos en lugar de `Intl`: crear un formateador cuesta en los móviles modestos y así sale igual en todas partes. */
const NAMES = {
  es: {
    days: ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'],
    daysShort: ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'],
    months: ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'],
    monthsShort: ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sept', 'oct', 'nov', 'dic'],
  },
  en: {
    days: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
    daysShort: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
    months: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
    monthsShort: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
  },
} as const

const weekdayOf = (iso: IsoDate) => fromIso(iso).getDay()
const monthOf = (iso: IsoDate) => Number(iso.slice(5, 7)) - 1

/** `jue` · `Thu` */
export const dayNameShort = (iso: IsoDate): string => pick(NAMES).daysShort[weekdayOf(iso)] ?? ''

/** `jueves` · `Thursday` */
export const dayNameLong = (iso: IsoDate): string => pick(NAMES).days[weekdayOf(iso)] ?? ''

/** `11` */
export const dayNumber = (iso: IsoDate) => String(fromIso(iso).getDate())

/** `sept` · `Sep` */
export const monthShort = (iso: IsoDate): string => pick(NAMES).monthsShort[monthOf(iso)] ?? ''

/** `septiembre` · `September` */
export const monthLong = (iso: IsoDate): string => pick(NAMES).months[monthOf(iso)] ?? ''

/** `11 sept` · `Sep 11` */
export const dayMonth = (iso: IsoDate): string =>
  language() === 'en' ? `${monthShort(iso)} ${dayNumber(iso)}` : `${dayNumber(iso)} ${monthShort(iso)}`

/** `jueves, 11 sept` · `Thursday, Sep 11` */
export function fullLabel(iso: IsoDate): string {
  return `${dayNameLong(iso)}, ${dayMonth(iso)}`
}

/** `8 – 14 sept` o `29 sept – 5 oct` · `Sep 8 – 14` o `Sep 29 – Oct 5` */
export function rangeLabel(from: IsoDate, to: IsoDate): string {
  const sameName = monthShort(from) === monthShort(to)
  if (language() === 'en') return `${dayMonth(from)} – ${sameName ? dayNumber(to) : dayMonth(to)}`
  const left = sameName ? dayNumber(from) : dayMonth(from)
  return `${left} – ${dayMonth(to)}`
}

const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/

export const isValidTime = (value: unknown): value is IsoTime => typeof value === 'string' && TIME_RE.test(value)

/** `HH:MM` a partir de horas y minutos sueltos. */
export const formatTime = (hours: number, minutes: number): IsoTime => `${pad(hours)}:${pad(minutes)}`

/** Instante (epoch ms) de un día y una hora locales. */
export function toInstant(iso: IsoDate, time: IsoTime): number {
  const date = fromIso(iso)
  const [h = 0, m = 0] = time.split(':').map(Number)
  date.setHours(h, m, 0, 0)
  return date.getTime()
}

/** Día local de un instante. */
export const isoOfInstant = (ms: number): IsoDate => toIso(new Date(ms))

/** Hora local de un instante. */
export function timeOfInstant(ms: number): IsoTime {
  const date = new Date(ms)
  return formatTime(date.getHours(), date.getMinutes())
}

/** Siguiente medianoche UTC: cuando se renueva la cuota diaria de Workers AI. */
export function nextUtcMidnight(ms: number): number {
  const date = new Date(ms)
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + 1)
}

/** Minutos desde medianoche → `9:05` (`17:30`) en español, `9:05 AM` (`5:30 PM`) en inglés. */
export function clockLabel(minutes: number): string {
  const hours = Math.floor(minutes / 60) % 24
  const mins = String(minutes % 60).padStart(2, '0')
  if (language() !== 'en') return `${hours}:${mins}`
  return `${hours % 12 || 12}:${mins} ${hours < 12 ? 'AM' : 'PM'}`
}

/** `9:00`, `17:30`: sin cero a la izquierda, como se lee en español; `9:00 AM`, `5:30 PM` en inglés. */
export const shortTime = (time: IsoTime): string => {
  const [hours = 0, minutes = 0] = time.split(':').map(Number)
  return clockLabel(hours * 60 + minutes)
}

const NEAR = {
  es: { today: 'Hoy', tomorrow: 'Mañana', yesterday: 'Ayer' },
  en: { today: 'Today', tomorrow: 'Tomorrow', yesterday: 'Yesterday' },
} as const

/** `Hoy`, `Mañana`, `Ayer` (`Today`…) o `null` para cualquier otro día. */
export function nearLabel(iso: IsoDate, today: IsoDate): string | null {
  const words = pick(NEAR)
  const delta = diffDays(today, iso)
  if (delta === 0) return words.today
  if (delta === 1) return words.tomorrow
  if (delta === -1) return words.yesterday
  return null
}

/** Etiqueta corta y relativa para una tarea: `Hoy`, `Mañana`, `jue 18 sept` · `Today`, `Thu, Sep 18`. */
export function relativeLabel(iso: IsoDate, today: IsoDate = todayIso()): string {
  const near = nearLabel(iso, today)
  if (near) return near
  return language() === 'en' ? `${dayNameShort(iso)}, ${dayMonth(iso)}` : `${dayNameShort(iso)} ${dayMonth(iso)}`
}

/** `septiembre 2026` · `September 2026` */
export const monthYear = (iso: IsoDate) => `${monthLong(iso)} ${iso.slice(0, 4)}`

const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1)

/**
 * Cabecera de un día, en dos partes (la segunda va atenuada): `Hoy` + `martes 29`, `Jueves` +
 * `1 octubre` · `Today` + `Tuesday 29`, `Thursday` + `October 1`.
 */
export function dayHeading(iso: IsoDate, today: IsoDate): { main: string; rest: string } {
  const near = nearLabel(iso, today)
  if (near) return { main: near, rest: `${dayNameLong(iso)} ${dayNumber(iso)}` }
  const rest = language() === 'en' ? `${monthLong(iso)} ${dayNumber(iso)}` : `${dayNumber(iso)} ${monthLong(iso)}`
  return { main: capitalize(dayNameLong(iso)), rest }
}
