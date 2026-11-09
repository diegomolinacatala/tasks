import type { IsoTime } from '../types'
import { formatTime } from './date'

/**
 * Piezas del analizador en inglés (`parseEn.ts`) para horas, plazos y días, sobre texto ya
 * normalizado (minúsculas, números en cifras). Las de español están en `when.ts`.
 */

export const MONTHS_EN = [
  'january|jan',
  'february|feb',
  'march|mar',
  'april|apr',
  'may',
  'june|jun',
  'july|jul',
  'august|aug',
  'september|sept|sep',
  'october|oct',
  'november|nov',
  'december|dec',
]

/** Todas las formas de los meses, de la más larga a la más corta (para que "sept" no se quede en "sep"). */
export const MONTH_SOURCE = MONTHS_EN.flatMap((names) => names.split('|'))
  .sort((a, b) => b.length - a.length)
  .join('|')

export const monthNumber = (name: string): number => MONTHS_EN.findIndex((names) => names.split('|').includes(name)) + 1

/** Domingo primero, como `Date.getDay()`. "sat" y "sun" no: son palabras ("I sat", "the sun"). */
export const WEEKDAYS_EN = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
const WEEKDAY_SHORT: Record<string, number> = { mon: 1, tue: 2, tues: 2, wed: 3, thu: 4, thur: 4, thurs: 4, fri: 5 }

export const WEEKDAY_SOURCE = [...WEEKDAYS_EN, ...Object.keys(WEEKDAY_SHORT).sort((a, b) => b.length - a.length)].join('|')

/** 0 = domingo … 6 = sábado. */
export const weekdayIndex = (name: string): number => {
  const full = WEEKDAYS_EN.indexOf(name)
  return full >= 0 ? full : (WEEKDAY_SHORT[name] ?? -1)
}

export const PART_OF_DAY_EN: Record<string, IsoTime> = {
  'first thing': '08:00',
  morning: '09:00',
  noon: '12:00',
  midday: '12:00',
  afternoon: '15:00',
  evening: '19:00',
  night: '21:00',
  tonight: '21:00',
  midnight: '00:00',
}

/**
 * Hora con sus matices. Grupos, en orden: prefijo ("at"), hora, separador, minutos, am/pm,
 * "o'clock", franja ("in the evening", "at night").
 */
export const TIME_SOURCE_EN =
  '((?:at|around|by|before|about) |@ ?)?(\\d{1,2})(?:(:|\\.)(\\d{2}))? ?(am|pm|a\\.m\\.?|p\\.m\\.?)?( ?o[\'’]?clock)?' +
  '(?: in the (morning|afternoon|evening)| at (night))?'

/**
 * Cantidad de tiempo. Grupos: número ("2", "1.5", "an", "half an"), unidad, "and a half|quarter",
 * "quarter of an hour", "3 quarters of an hour", "an hour and a half" sin número.
 */
export const AMOUNT_SOURCE_EN =
  '(\\d{1,3}(?:\\.\\d)?|half an?(?= )|an?(?= )) ?(minutes|minute|mins|min|hours|hour|hrs|hr|h|days|day|weeks|week)' +
  '(?: and (a half|a quarter))?|(?:a |1 )?(quarter) (?:of an )?hour|(3) quarters of an hour'

type Groups = readonly (string | undefined)[]

const isPm = (meridiem: string | undefined) => meridiem?.startsWith('p') ?? false
const isAm = (meridiem: string | undefined) => meridiem?.startsWith('a') ?? false

/**
 * Convierte una hora con matices (`5pm`, `at 5`, `7 in the morning`) a 24 h. `hint`: franja dicha
 * aparte ("tonight at 9").
 */
export function resolveHourEn(groups: Groups, hint?: string): IsoTime | null {
  const [prefix, rawHour = '', separator, rawMinutes, meridiem, oclock, part, night] = groups
  let hours = Number(rawHour)
  const minutes = rawMinutes ? Number(rawMinutes) : 0
  const dayPart = part ?? night
  const qualified = Boolean(meridiem || dayPart)

  // Un número suelto no es una hora: "buy 5 apples", "study 2 hours".
  if (!prefix && !rawMinutes && !qualified && !oclock) return null
  // "5.30" es una hora detrás de "at"; suelto puede ser un precio.
  if (separator === '.' && !prefix) return null
  if (hours > 23 || minutes > 59) return null
  if (meridiem && (hours < 1 || hours > 12)) return null

  const slot = dayPart ?? (meridiem ? undefined : hint)
  if ((isPm(meridiem) || slot === 'afternoon' || slot === 'evening' || slot === 'night' || slot === 'tonight') && hours < 12) hours += 12
  if ((isAm(meridiem) || slot === 'morning') && hours === 12) hours = 0
  if ((slot === 'night' || slot === 'tonight') && hours === 12) hours = 0
  // "at 5" o "at 3:30" sin más casi siempre es por la tarde, como "a las 5".
  if (prefix && !qualified && !hint && hours >= 1 && hours <= 7) hours += 12

  return hours >= 0 && hours <= 23 ? formatTime(hours, minutes) : null
}

function amountInMinutes(rawAmount: string, unit: string): number | null {
  const half = rawAmount.startsWith('half')
  if (half && !unit.startsWith('h')) return null
  const amount = half ? 0.5 : /^an?$/.test(rawAmount) ? 1 : Number(rawAmount)
  if (!Number.isFinite(amount) || amount <= 0) return null
  if (unit.startsWith('d')) return amount * 24 * 60
  if (unit.startsWith('w')) return amount * 7 * 24 * 60
  return unit.startsWith('m') ? amount : amount * 60
}

/** Minutos de una cantidad reconocida con `AMOUNT_SOURCE_EN`. */
export function amountOfEn(groups: Groups): number | null {
  const [amount = '', unit = '', extra, quarter, threeQuarters] = groups
  if (quarter) return 15
  if (threeQuarters) return 45
  const base = amountInMinutes(amount, unit)
  if (base === null || !extra) return base
  // "an hour and a half" sí; "five minutes and a half", no.
  return unit.startsWith('h') ? base + (extra === 'a half' ? 30 : 15) : null
}
