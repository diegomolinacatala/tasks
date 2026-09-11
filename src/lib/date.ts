import type { IsoDate } from '../types'

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

/** Etiqueta corta y relativa para una tarea: `Hoy`, `Mañana`, `jue 18 sep`. */
export function relativeLabel(iso: IsoDate, today: IsoDate = todayIso()): string {
  const delta = diffDays(today, iso)
  if (delta === 0) return 'Hoy'
  if (delta === 1) return 'Mañana'
  if (delta === -1) return 'Ayer'
  return `${dayNameShort(iso)} ${dayNumber(iso)} ${monthShort(iso)}`
}
