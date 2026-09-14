import type { IsoDate, IsoTime } from '../types'
import { formatTime, toIso } from './date'

/** Piezas del analizador para días, horas y plazos, sobre texto ya normalizado (sin tildes). */

export const DAY_MINUTES = 24 * 60

export const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
export const MONTHS_SHORT = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sept?', 'oct', 'nov', 'dic']
export const WEEKDAYS = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado']

export const PART_OF_DAY: Record<string, IsoTime> = {
  'primera hora': '08:00',
  manana: '09:00',
  mediodia: '14:00',
  tarde: '18:00',
  noche: '21:00',
}

/**
 * Hora con sus matices. Grupos, en orden: prefijo ("a las"), hora, separador, minutos, sufijo,
 * fracción ("y media"), "menos cuarto", franja ("de la tarde"), "del mediodía", am/pm.
 */
export const TIME_SOURCE =
  '((?:a|sobre|hacia|antes de) (?:las|la) )?(\\d{1,2})(?:(:|h|\\.)(\\d{2}))?( ?h| horas| hrs)?' +
  '(?: y (media|cuarto)| (menos cuarto))?(?: de la (manana|tarde|noche|madrugada)| del (mediodia)| ?(am|pm))?'

/**
 * Cantidad de tiempo. Grupos: número, unidad, "y media|cuarto", "cuarto de hora",
 * "tres cuartos de hora", "hora y media|cuarto" sin número.
 */
export const AMOUNT_SOURCE =
  '(\\d{1,3}|media|medio) ?(minutos|minuto|mins|min|horas|hora|hrs|hr|h|dias|dia|semanas|semana)(?: y (media|cuarto))?' +
  '|(?:1 )?(cuarto) de hora|(3) cuartos de hora|(hora) y (media|cuarto)'

type Groups = readonly (string | undefined)[]

/** Fecha real (descarta 31/02) y, si no trae año y ya pasó, la del año siguiente. */
export function resolveDay(day: number, month: number, year: number | null, today: IsoDate): IsoDate | null {
  const currentYear = Number(today.slice(0, 4))
  const build = (y: number) => {
    const date = new Date(y, month - 1, day)
    return date.getMonth() === month - 1 && date.getDate() === day ? toIso(date) : null
  }
  if (year !== null) return build(year < 100 ? 2000 + year : year)
  const iso = build(currentYear)
  return iso && iso < today ? build(currentYear + 1) : iso
}

/**
 * "el 22", "el día 1": el próximo día del mes con ese número, hoy incluido. Con `weekday`
 * ("el sábado 26") ese día tiene que caer además en ese día de la semana; si no, no es una fecha.
 */
export function resolveDayOfMonth(day: number, today: IsoDate, weekday?: number): IsoDate | null {
  if (!Number.isInteger(day) || day < 1 || day > 31) return null
  const [year = 0, month = 1] = today.split('-').map(Number)
  for (let ahead = 0; ahead < 3; ahead++) {
    const date = new Date(year, month - 1 + ahead, day)
    if (date.getDate() !== day || toIso(date) < today) continue
    return weekday === undefined || date.getDay() === weekday ? toIso(date) : null
  }
  return null
}

/**
 * Convierte hora con matices (`de la tarde`, `pm`, `a las 5`) a 24 h. `hint`: franja dicha
 * aparte ("esta noche a las nueve").
 */
export function resolveHour(groups: Groups, hint?: string): IsoTime | null {
  const [prefix, rawHour = '', separator, rawMinutes, suffix, fraction, minusQuarter, part, noon, meridiem] = groups
  let hours = Number(rawHour)
  let minutes = rawMinutes ? Number(rawMinutes) : 0
  const qualified = Boolean(part || noon || meridiem)
  const shortSuffix = suffix?.trim() === 'h'

  // Un número suelto no es una hora: "comprar 5 manzanas", "estudiar 2 horas".
  const explicit = Boolean(prefix || rawMinutes || qualified || fraction || minusQuarter)
  if (!explicit && !(shortSuffix && hours >= 6 && hours <= 23)) return null
  // "20.00" es una hora detrás de "a las"; suelto puede ser un precio.
  if (separator === '.' && !prefix) return null
  if (hours > 23 || minutes > 59) return null

  if (fraction === 'media') minutes = 30
  if (fraction === 'cuarto') minutes = 15
  if (minusQuarter) {
    hours -= 1
    minutes = 45
  }

  const dayPart = part ?? (meridiem ? undefined : hint)
  if ((dayPart === 'tarde' || dayPart === 'noche' || meridiem === 'pm') && hours < 12) hours += 12
  if ((dayPart === 'manana' || dayPart === 'madrugada' || dayPart === 'noche' || meridiem === 'am') && hours === 12) hours = 0
  if ((noon || dayPart === 'mediodia') && hours >= 1 && hours <= 4) hours += 12
  // "a las 5" sin más casi siempre es por la tarde.
  if (prefix && !qualified && !hint && !rawMinutes && hours >= 1 && hours <= 7) hours += 12

  return hours >= 0 && hours <= 23 ? formatTime(hours, minutes) : null
}

function amountInMinutes(rawAmount: string, unit: string): number | null {
  const half = rawAmount === 'media' || rawAmount === 'medio'
  if (half && !unit.startsWith('h')) return null
  const amount = half ? 0.5 : Number(rawAmount)
  if (!Number.isFinite(amount) || amount <= 0) return null
  if (unit.startsWith('d')) return amount * DAY_MINUTES
  if (unit.startsWith('s')) return amount * 7 * DAY_MINUTES
  return unit.startsWith('m') ? amount : amount * 60
}

/** Minutos de una cantidad reconocida con `AMOUNT_SOURCE`. */
export function amountOf(groups: Groups): number | null {
  const [amount = '', unit = '', extra, quarter, threeQuarters, bareHour, bareExtra] = groups
  if (quarter) return 15
  if (threeQuarters) return 45
  if (bareHour) return bareExtra === 'media' ? 90 : 75
  const base = amountInMinutes(amount, unit)
  if (base === null || !extra) return base
  // "una hora y media" sí; "cinco minutos y media", no.
  return unit.startsWith('h') ? base + (extra === 'media' ? 30 : 15) : null
}
