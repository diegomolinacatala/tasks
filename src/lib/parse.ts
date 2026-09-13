import type { IsoDate, IsoTime, ReminderDraft } from '../types'
import { addDays, formatTime, isoOfInstant, relativeLabel, shortTime, timeOfInstant, toInstant, toIso } from './date'
import type { NormalizedText } from './normalize'
import { normalizeText, originalSpan } from './normalize'
import { reminderLabel } from './reminders'

export interface ParsedTask {
  title: string
  date: IsoDate | null
  time: IsoTime | null
  reminders: ReminderDraft[]
  /** Resumen de lo detectado (`Mañana 17:00 · 10 min antes`), o `null` si no se detectó nada. */
  label: string | null
}

interface Span {
  start: number
  end: number
}

const MINUTE = 60_000
const DAY_MINUTES = 24 * 60

/** Palabra completa: sin letras ni dígitos pegados a los lados. */
const word = (source: string) => new RegExp(`(?<![a-z0-9])(?:${source})(?![a-z0-9])`, 'g')

const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
const MONTHS_SHORT = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sept?', 'oct', 'nov', 'dic']
const WEEKDAYS = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado']

const PART_OF_DAY: Record<string, IsoTime> = { manana: '09:00', mediodia: '14:00', tarde: '18:00', noche: '21:00' }

/** "y recuérdamelo", "avísame", "con un aviso": introduce un recordatorio. */
const REMIND_VERB =
  '(?:y |, ?)?(?:que )?(?:me )?(?:lo |la )?' +
  '(?:recuerdamelo|recuerdamela|recuerdame|recuerdalo|recordarmelo|recordarme|recordarlo|recordarla|recordar' +
  '|avisamelo|avisame|avisarme|avisarlo|avisa|con (?:un )?(?:aviso|recordatorio))'

/** Hora con sus matices; los grupos los interpreta `resolveHour`. */
const TIME_SOURCE =
  '((?:a|sobre|hacia) (?:las|la) )?(\\d{1,2})(?:(?::|h)(\\d{2}))?( ?h| horas| hrs)?' +
  '(?: y (media|cuarto)| (menos cuarto))?(?: de la (manana|tarde|noche|madrugada)| ?(am|pm))?'

const RE_OFFSET = word(
  '(?:en|dentro de) (\\d{1,3}|media|medio) ?(minutos|minuto|mins|min|horas|hora|hrs|hr|h|dias|dia|semanas|semana)',
)
const RE_REMIND_BEFORE = word(
  `(?:${REMIND_VERB}(?: de)? )?(?:(\\d{1,3}|media|medio) ?(minutos|minuto|mins|min|horas|hora|hrs|h|dias|dia)|(?:el|un) (dia)) antes`,
)
const RE_REMIND_ON_TIME = word(`${REMIND_VERB} (?:a la hora|en el momento)`)
const RE_REMIND_AT = word(`${REMIND_VERB} ${TIME_SOURCE}`)
const RE_DATE_LONG = word(`(?:el )?(\\d{1,2}) de (${MONTHS.join('|')}|setiembre)(?: de (\\d{4}))?`)
const RE_DATE_SHORT = word(`(?:el )?(\\d{1,2}) (${MONTHS_SHORT.join('|')})\\.?`)
const RE_DATE_NUMERIC = word('(?:el )?(\\d{1,2})/(\\d{1,2})(?:/(\\d{4}|\\d{2}))?')
const RE_TIME = word(TIME_SOURCE)
const RE_PART = word('(por la|esta) (manana|tarde|noche)|(?:a|al) (mediodia)')
const RE_DAY_WORD = word('pasado manana|manana|hoy')
const RE_WEEKDAY = word(`(?:el |este |el proximo |proximo )?(${WEEKDAYS.join('|')})(?: que viene)?`)

/** Lo que el dictado suele poner delante y no forma parte de la tarea. */
const RE_PREFIX = /^(?:recu[eé]rdame(?: que)?|recordar(?:me)?(?: que)?|ap[uú]nta(?:me)?(?: que)?|a[ñn]ade|a[ñn]adir|nueva tarea|crea(?:r)? (?:una )?tarea(?: para)?)[:,]?\s+/i

/** Fecha real (descarta 31/02) y, si no trae año y ya pasó, la del año siguiente. */
function resolveDay(day: number, month: number, year: number | null, today: IsoDate): IsoDate | null {
  const currentYear = Number(today.slice(0, 4))
  const build = (y: number) => {
    const date = new Date(y, month - 1, day)
    return date.getMonth() === month - 1 && date.getDate() === day ? toIso(date) : null
  }
  if (year !== null) return build(year < 100 ? 2000 + year : year)
  const iso = build(currentYear)
  return iso && iso < today ? build(currentYear + 1) : iso
}

/** Convierte hora con matices (`de la tarde`, `pm`, `a las 5`) a 24 h. */
function resolveHour(match: RegExpExecArray): IsoTime | null {
  const [, prefix, rawHour = '', rawMinutes, suffix, fraction, minusQuarter, part, meridiem] = match
  let hours = Number(rawHour)
  let minutes = rawMinutes ? Number(rawMinutes) : 0
  const qualified = Boolean(part || meridiem)
  const shortSuffix = suffix?.trim() === 'h'

  // Un número suelto no es una hora: "comprar 5 manzanas", "estudiar 2 horas".
  const explicit = Boolean(prefix || rawMinutes || qualified || fraction || minusQuarter)
  if (!explicit && !(shortSuffix && hours >= 6 && hours <= 23)) return null
  if (hours > 23 || minutes > 59) return null

  if (fraction === 'media') minutes = 30
  if (fraction === 'cuarto') minutes = 15
  if (minusQuarter) {
    hours -= 1
    minutes = 45
  }

  const afternoon = part === 'tarde' || part === 'noche' || meridiem === 'pm'
  if (afternoon && hours < 12) hours += 12
  if ((part === 'manana' || part === 'madrugada' || meridiem === 'am') && hours === 12) hours = 0
  // "a las 5" sin más casi siempre es por la tarde.
  if (prefix && !qualified && !rawMinutes && hours >= 1 && hours <= 7) hours += 12

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

class Scanner {
  readonly spans: Span[] = []

  constructor(readonly normalized: NormalizedText) {}

  /** Primer resultado aceptado que no pise lo ya reconocido. Los tramos se guardan en el original. */
  first<T>(regex: RegExp, accept: (match: RegExpExecArray) => T | null): T | null {
    for (const match of this.normalized.text.matchAll(regex)) {
      const span = originalSpan(this.normalized, match.index, match.index + match[0].length)
      if (this.spans.some((other) => span.start < other.end && span.end > other.start)) continue
      const value = accept(match as RegExpExecArray)
      if (value === null) continue
      this.spans.push(span)
      return value
    }
    return null
  }
}

const CONNECTORS = /^(?:(?:y|a|el|la|de|para|,)\s+)+|(?:\s+(?:y|a|el|la|de|para|,))+$/i

function cleanTitle(original: string, spans: Span[]): string {
  const sorted = [...spans].sort((a, b) => b.start - a.start)
  const cut = sorted.reduce((text, span) => `${text.slice(0, span.start)} ${text.slice(span.end)}`, original)
  let title = cut.replace(/\s+/g, ' ').replace(/\s+([,.;:])/g, '$1').trim()
  let previous = ''
  while (previous !== title) {
    previous = title
    title = title.replace(CONNECTORS, '').replace(/[,.;:]+$/, '').trim()
  }
  const unprefixed = title.replace(RE_PREFIX, '')
  const result = unprefixed || title
  // El dictado empieza en mayúscula o no según el motor: se respeta, solo se evita la minúscula
  // inicial cuando se ha recortado un prefijo ("Recuérdame llamar…" → "Llamar…").
  return unprefixed && unprefixed !== title ? result.charAt(0).toUpperCase() + result.slice(1) : result
}

const literal = (input: string): ParsedTask => ({ title: input.trim(), date: null, time: null, reminders: [], label: null })

/** Extrae fecha, hora y avisos de un texto en español. Si no queda título, lo deja literal. */
export function parseTask(input: string, now: number): ParsedTask {
  const today = isoOfInstant(now)
  const scanner = new Scanner(normalizeText(input))
  const explicit: ReminderDraft[] = []
  const remindAtTimes: IsoTime[] = []

  let date: IsoDate | null = null

  const offset = scanner.first<{ days: number } | { at: number }>(RE_OFFSET, ([, amount = '', unit = '']) => {
    const minutes = amountInMinutes(amount, unit)
    if (minutes === null) return null
    if (minutes >= DAY_MINUTES && minutes % DAY_MINUTES === 0) return { days: minutes / DAY_MINUTES }
    return { at: Math.ceil((now + minutes * MINUTE) / MINUTE) * MINUTE }
  })
  if (offset && 'at' in offset) {
    explicit.push({ kind: 'at', at: offset.at })
    date = isoOfInstant(offset.at)
  } else if (offset) {
    date = addDays(today, offset.days)
  }

  // Los recordatorios van antes que la hora: "avísame a las 4" no es la hora de la tarea.
  for (;;) {
    const before = scanner.first(RE_REMIND_BEFORE, ([, amount, unit, day]) =>
      day ? DAY_MINUTES : amountInMinutes(amount ?? '', unit ?? ''),
    )
    if (before === null) break
    explicit.push({ kind: 'before', minutes: Math.round(before) })
  }
  if (scanner.first(RE_REMIND_ON_TIME, () => true)) explicit.push({ kind: 'before', minutes: 0 })
  for (;;) {
    const at = scanner.first(RE_REMIND_AT, (match) => (match[1] ? resolveHour(match) : null))
    if (at === null) break
    remindAtTimes.push(at)
  }

  date =
    scanner.first(RE_DATE_LONG, ([, d, month, year]) =>
      resolveDay(Number(d), month === 'setiembre' ? 9 : MONTHS.indexOf(month ?? '') + 1, year ? Number(year) : null, today),
    ) ??
    scanner.first(RE_DATE_SHORT, ([, d, month = '']) =>
      resolveDay(Number(d), MONTHS_SHORT.findIndex((m) => new RegExp(`^${m}$`).test(month)) + 1, null, today),
    ) ??
    scanner.first(RE_DATE_NUMERIC, ([, d, m, y]) => resolveDay(Number(d), Number(m), y ? Number(y) : null, today)) ??
    date

  let time = scanner.first(RE_TIME, resolveHour)

  const part = scanner.first(RE_PART, ([, kind, name, noon]) => ({
    time: PART_OF_DAY[noon ?? name ?? ''] ?? null,
    today: kind === 'esta',
  }))
  if (part) {
    time = time ?? part.time
    if (part.today) date = date ?? today
  }

  date =
    scanner.first(RE_DAY_WORD, ([value]) => {
      if (value === 'hoy') return today
      return addDays(today, value === 'manana' ? 1 : 2)
    }) ??
    scanner.first(RE_WEEKDAY, ([, name]) => {
      const target = WEEKDAYS.indexOf(name ?? '')
      const current = new Date(now).getDay()
      return addDays(today, (target - current + 7) % 7 || 7)
    }) ??
    date

  if (scanner.spans.length === 0) return literal(input)
  const title = cleanTitle(input, scanner.spans)
  if (!title) return literal(input)

  if (time) {
    // Una hora sin día que ya pasó hoy se entiende para mañana.
    date = date ?? (toInstant(today, time) > now ? today : addDays(today, 1))
  } else if (remindAtTimes.length) {
    date = date ?? today
  }

  const reminders: ReminderDraft[] = [
    ...explicit,
    ...remindAtTimes.map((at): ReminderDraft => ({ kind: 'at', at: toInstant(date ?? today, at) })),
  ]
  const isDefault = time !== null && reminders.length === 0
  // Con hora y sin avisos pedidos, se avisa a la hora.
  if (isDefault) reminders.push({ kind: 'before', minutes: 0 })

  return { title, date, time, reminders, label: describe(date, time, reminders, isDefault, now) }
}

/**
 * Igual que `parseTask`, pero para texto dictado: aunque no traiga fecha ni hora, se limpian
 * la muletilla inicial ("Recuérdame…") y la puntuación final que añade la transcripción.
 */
export function parseSpoken(input: string, now: number): ParsedTask {
  const parsed = parseTask(input.trim(), now)
  if (parsed.label !== null) return parsed
  return { ...parsed, title: cleanTitle(parsed.title, []) }
}

function describe(
  date: IsoDate | null,
  time: IsoTime | null,
  reminders: ReminderDraft[],
  isDefault: boolean,
  now: number,
): string {
  const today = isoOfInstant(now)
  const parts: string[] = []
  if (date) parts.push(relativeLabel(date, today))
  if (time) parts.push(shortTime(time))

  const extras = isDefault
    ? []
    : reminders.map((reminder) =>
        reminder.kind === 'at' && !time ? shortTime(timeOfInstant(reminder.at)) : reminderLabel(reminder, now),
      )
  if (!time && extras.length && reminders[0]?.kind === 'at') {
    // "en 30 min": la hora del aviso es lo que da sentido a la etiqueta.
    parts.push(extras.shift() ?? '')
  }
  return [parts.join(' '), ...extras].filter(Boolean).join(' · ')
}
