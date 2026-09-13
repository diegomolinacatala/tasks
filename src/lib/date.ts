import type { IsoDate, IsoTime } from '../types'

const LOCALE = 'es-ES'
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

const fmt = (iso: IsoDate, options: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat(LOCALE, options).format(fromIso(iso))

const strip = (value: string) => value.replace(/\.$/, '')

/** `jue` */
export const dayNameShort = (iso: IsoDate) => strip(fmt(iso, { weekday: 'short' }))

/** `jueves` */
export const dayNameLong = (iso: IsoDate) => fmt(iso, { weekday: 'long' })

/** `11` */
export const dayNumber = (iso: IsoDate) => String(fromIso(iso).getDate())

/** `sep` */
export const monthShort = (iso: IsoDate) => strip(fmt(iso, { month: 'short' }))

/** `jueves, 11 sep` */
export function fullLabel(iso: IsoDate): string {
  return `${dayNameLong(iso)}, ${dayNumber(iso)} ${monthShort(iso)}`
}

/** `8 – 14 sep` o `29 sep – 5 oct` */
export function rangeLabel(from: IsoDate, to: IsoDate): string {
  const left = monthShort(from) === monthShort(to) ? dayNumber(from) : `${dayNumber(from)} ${monthShort(from)}`
  return `${left} – ${dayNumber(to)} ${monthShort(to)}`
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

/** `9:00`, `17:30`: sin cero a la izquierda, como se lee en español. */
export const shortTime = (time: IsoTime): string => time.replace(/^0(\d)/, '$1')

/** Etiqueta corta y relativa para una tarea: `Hoy`, `Mañana`, `jue 18 sep`. */
export function relativeLabel(iso: IsoDate, today: IsoDate = todayIso()): string {
  const delta = diffDays(today, iso)
  if (delta === 0) return 'Hoy'
  if (delta === 1) return 'Mañana'
  if (delta === -1) return 'Ayer'
  return `${dayNameShort(iso)} ${dayNumber(iso)} ${monthShort(iso)}`
}
