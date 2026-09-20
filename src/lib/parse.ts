import type { IsoDate, IsoTime, Place, PlaceTrigger, ReminderDraft, TaskDraft } from '../types'
import { addDays, isoOfInstant, relativeLabel, shortTime, startOfWeek, timeOfInstant, toInstant } from './date'
import { MAX_DURATION, MIN_DURATION, durationFromEnd, durationLabel, spanLabel } from './duration'
import type { NormalizedText } from './normalize'
import { normalizeText, originalSpan } from './normalize'
import { placePhraseRegex, readPlacePhrase } from './placePhrase'
import { placeTriggerLabel } from './places'
import { reminderLabel } from './reminders'
import type { Span } from './title'
import { capitalize, cleanTitle, isRequestQuestion, unwrapQuestion } from './title'
import {
  AMOUNT_SOURCE,
  DAY_MINUTES,
  MONTHS,
  MONTHS_SHORT,
  PART_OF_DAY,
  TIME_SOURCE,
  WEEKDAYS,
  amountOf,
  resolveDay,
  resolveDayOfMonth,
  resolveHour,
} from './when'

export interface ParsedTask extends TaskDraft {
  /** Resumen de lo detectado (`Mañana 17:00 · 10 min antes`), o `null` si no se detectó nada. */
  label: string | null
}

const MINUTE = 60_000

/** Palabra completa: sin letras ni dígitos pegados a los lados. */
const word = (source: string) => new RegExp(`(?<![a-z0-9])(?:${source})(?![a-z0-9])`, 'g')

const WEEKDAY = WEEKDAYS.join('|')
const NEXT_WEEK = '(?:semana que viene|proxima semana|semana siguiente)'

/** "y recuérdamelo", "me gustaría que me lo recordaras", "avísame": introduce un recordatorio. */
const REMIND_VERB =
  '(?:y |, ?)?(?:me gustaria |quiero |necesito |puedes |podrias )?(?:que )?(?:me )?(?:lo |la )?' +
  '(?:recuerdamelo|recuerdamela|recuerdame|recuerdalo|recuerdes|recuerdas|recordaras|recordases' +
  '|recordarmelo|recordarme|recordarlo|recordarla|recordar|avisamelo|avisame|avisarme|avisarlo' +
  '|avisaras|avisases|avises|avisas|avisa|con (?:1 )?(?:aviso|recordatorio))'

const RE_OFFSET = word(`(?:en|dentro de) (?:${AMOUNT_SOURCE})`)
/** "el día antes a las 8", "dos días antes a las 10", "la noche anterior a las 22:00". */
const RE_REMIND_DAYS_BEFORE_AT = word(
  `(?:${REMIND_VERB} )?(?:(?:el|1) dia (?:antes|anterior)|(\\d) dias antes|la vispera|la noche anterior) ${TIME_SOURCE}`,
)
/** "recuérdamelo por la mañana", "avísame el día anterior por la tarde", "el sábado por la noche". */
const RE_REMIND_PART = word(
  `${REMIND_VERB} (?:(?:((?:el|1) dia (?:antes|anterior)|la vispera)|(?:el )?(${WEEKDAY})|(pasado manana|manana|hoy)) )?` +
    '(?:por la (manana|tarde|noche)|a (primera hora)|al (mediodia))',
)
const RE_REMIND_BEFORE = word(`(?:${REMIND_VERB}(?: de)? )?(?:(?:${AMOUNT_SOURCE})|el (dia)) (?:antes|anterior)`)
const RE_REMIND_NOTICE = word(`(?:${REMIND_VERB} )?con (?:${AMOUNT_SOURCE}) de antelacion`)
const RE_REMIND_ON_TIME = word(`${REMIND_VERB} (?:a la hora|en el momento)`)
const RE_REMIND_AT = word(`${REMIND_VERB} ${TIME_SOURCE}`)
/** "avísame una hora antes y a las 9", "a las 7:30 y otra vez a las 7:50": pegado a otro aviso. */
const RE_CHAIN_AT = word(`y (?:otra vez )?${TIME_SOURCE}`)
const RE_NEXT_WEEK_DAY = word(`(?:la )?${NEXT_WEEK},? (?:el )?(${WEEKDAY})|(?:el )?(${WEEKDAY}) de la ${NEXT_WEEK}`)
const RE_DATE_LONG = word(`(?:antes del |el |del )?(\\d{1,2}) de (${MONTHS.join('|')}|setiembre)(?: de (\\d{4}))?`)
const RE_DATE_SHORT = word(`(?:el )?(\\d{1,2}) (${MONTHS_SHORT.join('|')})\\.?`)
const RE_DATE_NUMERIC = word('(?:el )?(\\d{1,2})/(\\d{1,2})(?:/(\\d{4}|\\d{2}))?')
const RE_WEEKDAY_NUMBER = word(`(?:el )?(${WEEKDAY}) (\\d{1,2})(?! ?(?:de |:|\\.\\d|h(?![a-z])|minutos?|min|horas?|dias?))`)
/**
 * "el día 5", "antes del 15", "el 22 a las 10". Un "el 5" suelto no es un día: puede ser un
 * portal o un número de factura ("aparcar en el 5").
 */
const RE_DAY_OF_MONTH = word('(?:antes )?(?:del|el) dia (\\d{1,2})|antes del (\\d{1,2})|el (\\d{1,2})(?= a (?:las?|primera) | por la )')
/** "durante una hora", "de 45 minutos", "que dura hora y media": cuánto ocupa la tarea. */
const RE_DURATION = word(`(?:(?:que )?(?:durante|duran|dura)|de) (?:${AMOUNT_SOURCE})`)
/** "una hora de duración". */
const RE_DURATION_OF = word(`(?:${AMOUNT_SOURCE}) de duracion`)
/** "de 17:30 a 18:30", "de las 5 a las 7": a qué hora empieza y a cuál acaba. */
const RE_SPAN = word(`(?:de|desde) (las |la )?${TIME_SOURCE} (?:a|hasta) (las |la )?${TIME_SOURCE}`)
/** "hasta las 19:00": la hora de acabar; la de empezar es la de la tarea. */
const RE_UNTIL = word(`hasta (?:las |la )${TIME_SOURCE}`)
const RE_TIME = word(TIME_SOURCE)
const RE_PART = word('(por la|esta) (manana|tarde|noche)|(?:a|al) (mediodia)|a (primera hora)')
const RE_DAY_WORD = word('pasado manana|manana|hoy')
const RE_WEEKDAY = word(`(?:el |este |el proximo |proximo )?(${WEEKDAY})(?: que viene)?`)

/** Aviso a una hora concreta que depende del día de la tarea (`daysBefore`) o tiene el suyo. */
type PendingAt = { time: IsoTime; daysBefore: number } | { time: IsoTime; date: IsoDate }

/** Una duración es un rato del día: "de tres días" no lo es y se queda en el título. */
function durationAmount(groups: readonly (string | undefined)[]): number | null {
  const minutes = amountOf(groups)
  if (minutes === null) return null
  const rounded = Math.round(minutes)
  return rounded >= MIN_DURATION && rounded <= MAX_DURATION ? rounded : null
}

/**
 * Hora dentro de un tramo ("de 5 a 7"): el propio tramo ya dice que son horas, así que se
 * resuelve como si llevara "a las" delante, con su misma regla de tarde ("a las 5" es 17:00).
 */
const spanHour = (groups: readonly (string | undefined)[]) => resolveHour(['a las ', ...groups.slice(1)])

class Scanner {
  readonly spans: Span[] = []
  /** Final de cada tramo aceptado, en el texto normalizado. */
  readonly ends: number[] = []

  constructor(readonly normalized: NormalizedText) {}

  /** Primer resultado aceptado que no pise lo ya reconocido. Los tramos se guardan en el original. */
  first<T>(regex: RegExp, accept: (match: RegExpExecArray) => T | null, startsAt?: (index: number) => boolean): T | null {
    return this.firstSized(
      regex,
      (match) => {
        const value = accept(match)
        return value === null ? null : { value, length: match[0].length }
      },
      startsAt,
    )
  }

  /** Como `first`, pero `accept` decide cuánto del resultado es tramo reconocido. */
  firstSized<T>(
    regex: RegExp,
    accept: (match: RegExpExecArray) => { value: T; length: number } | null,
    startsAt?: (index: number) => boolean,
  ): T | null {
    for (const match of this.normalized.text.matchAll(regex)) {
      if (startsAt && !startsAt(match.index)) continue
      const result = accept(match as RegExpExecArray)
      if (result === null) continue
      const end = match.index + result.length
      const span = originalSpan(this.normalized, match.index, end)
      if (this.spans.some((other) => span.start < other.end && span.end > other.start)) continue
      this.spans.push(span)
      this.ends.push(end)
      return result.value
    }
    return null
  }

  all<T>(regex: RegExp, accept: (match: RegExpExecArray) => T | null): T[] {
    const found: T[] = []
    for (let value = this.first(regex, accept); value !== null; value = this.first(regex, accept)) found.push(value)
    return found
  }
}

const literal = (input: string): ParsedTask => ({
  title: input.trim(),
  date: null,
  time: null,
  duration: null,
  reminders: [],
  label: null,
})

/**
 * Extrae fecha, hora y avisos de un texto en español. Si no queda título, lo deja literal.
 * `places`: lugares guardados, para reconocer "al llegar a la universidad". `null` = la
 * plataforma no tiene avisos por lugar (la PWA): esas frases se dejan como están.
 */
export function parseTask(input: string, now: number, places: readonly Place[] | null = []): ParsedTask {
  const today = isoOfInstant(now)
  const scanner = new Scanner(normalizeText(input))
  const nextWeekday = (name: string) => addDays(today, (WEEKDAYS.indexOf(name) - new Date(now).getDay() + 7) % 7 || 7)
  const dayWord = (value: string) => addDays(today, value === 'hoy' ? 0 : value === 'manana' ? 1 : 2)

  const explicit: ReminderDraft[] = []
  const pending: PendingAt[] = []
  let offsetDate: IsoDate | null = null

  // El lugar va primero: se lleva la petición que lo acompaña ("recuérdame al pasar por…").
  const known = places ?? []
  const placePhrase =
    places === null
      ? null
      : scanner.firstSized(placePhraseRegex(REMIND_VERB, known), (match) => {
          const phrase = readPlacePhrase(match, scanner.normalized, input, known)
          return { value: phrase, length: phrase.length }
        })

  const offset = scanner.first(RE_OFFSET, (match) => amountOf(match.slice(1)))
  if (offset !== null && offset >= DAY_MINUTES && offset % DAY_MINUTES === 0) {
    offsetDate = addDays(today, offset / DAY_MINUTES)
  } else if (offset !== null) {
    const at = Math.ceil((now + offset * MINUTE) / MINUTE) * MINUTE
    explicit.push({ kind: 'at', at })
    offsetDate = isoOfInstant(at)
  }

  // Los recordatorios van antes que la hora: "avísame a las 4" no es la hora de la tarea.
  const firstReminder = scanner.ends.length
  pending.push(
    ...scanner.all(RE_REMIND_DAYS_BEFORE_AT, (match): PendingAt | null => {
      const time = resolveHour(match.slice(2))
      return time ? { time, daysBefore: match[1] ? Number(match[1]) : 1 } : null
    }),
    ...scanner.all(RE_REMIND_PART, ([, dayBefore, weekday, day, part, first, noon]): PendingAt | null => {
      const time = PART_OF_DAY[part ?? first ?? noon ?? '']
      if (!time) return null
      if (weekday) return { time, date: nextWeekday(weekday) }
      return day ? { time, date: dayWord(day) } : { time, daysBefore: dayBefore ? 1 : 0 }
    }),
  )
  const before = [
    ...scanner.all(RE_REMIND_BEFORE, (match) => (match[8] ? DAY_MINUTES : amountOf(match.slice(1, 8)))),
    ...scanner.all(RE_REMIND_NOTICE, (match) => amountOf(match.slice(1))),
  ]
  explicit.push(...before.map((minutes): ReminderDraft => ({ kind: 'before', minutes: Math.round(minutes) })))
  if (scanner.first(RE_REMIND_ON_TIME, () => true)) explicit.push({ kind: 'before', minutes: 0 })
  pending.push(...scanner.all(RE_REMIND_AT, (match) => (match[1] ? resolveHour(match.slice(1)) : null)).map((time) => ({ time, daysBefore: 0 })))
  for (;;) {
    const reminderEnds = scanner.ends.slice(firstReminder)
    const nextTo = (index: number) => reminderEnds.some((end) => index - end >= 0 && index - end <= 2)
    const time = scanner.first(RE_CHAIN_AT, (match) => (match[1] ? resolveHour(match.slice(1)) : null), nextTo)
    if (time === null) break
    pending.push({ time, daysBefore: 0 })
  }

  // Cuánto dura, después de los avisos ("una hora antes" es un aviso, no una duración) y antes
  // de la hora, para que un tramo se quede con sus dos horas en vez de dejar solo la primera.
  const span = scanner.first(RE_SPAN, (match) => {
    const from = match.slice(2, 12)
    const to = match.slice(13, 23)
    // "de 5 a 7" son horas si alguna lleva "las" o si por sí sola ya se lee como hora ("17:30").
    const marked = Boolean(match[1] ?? match[12]) || resolveHour(from) !== null || resolveHour(to) !== null
    const start = marked ? spanHour(from) : null
    const end = marked ? spanHour(to) : null
    return start && end ? { start, end } : null
  })
  const until = span ? null : scanner.first(RE_UNTIL, (match) => spanHour(match.slice(1)))
  const spokenDuration =
    scanner.first(RE_DURATION_OF, (match) => durationAmount(match.slice(1))) ??
    scanner.first(RE_DURATION, (match) => durationAmount(match.slice(1)))

  const explicitDate =
    scanner.first(RE_NEXT_WEEK_DAY, ([, name, other]) => {
      const weekday = WEEKDAYS.indexOf(name ?? other ?? '')
      return addDays(startOfWeek(today), 7 + ((weekday + 6) % 7))
    }) ??
    scanner.first(RE_DATE_LONG, ([, d, month, year]) =>
      resolveDay(Number(d), month === 'setiembre' ? 9 : MONTHS.indexOf(month ?? '') + 1, year ? Number(year) : null, today),
    ) ??
    scanner.first(RE_DATE_SHORT, ([, d, month = '']) =>
      resolveDay(Number(d), MONTHS_SHORT.findIndex((m) => new RegExp(`^${m}$`).test(month)) + 1, null, today),
    ) ??
    scanner.first(RE_DATE_NUMERIC, ([, d, m, y]) => resolveDay(Number(d), Number(m), y ? Number(y) : null, today)) ??
    scanner.first(RE_WEEKDAY_NUMBER, ([, name = '', d]) => resolveDayOfMonth(Number(d), today, WEEKDAYS.indexOf(name))) ??
    scanner.first(RE_DAY_OF_MONTH, ([, d, before, bare]) => resolveDayOfMonth(Number(d ?? before ?? bare), today))

  const part = scanner.first(RE_PART, ([, kind, name, noon, first]) => {
    const key = name ?? noon ?? first ?? ''
    return { key, time: PART_OF_DAY[key] ?? null, today: kind === 'esta' }
  })
  // "esta noche a las nueve": la franja decide si la hora es de mañana o de tarde.
  const time = span ? span.start : (scanner.first(RE_TIME, (match) => resolveHour(match.slice(1), part?.key)) ?? part?.time ?? null)
  const namedDay = scanner.first(RE_DAY_WORD, ([value = '']) => dayWord(value))
  const weekday = scanner.first(RE_WEEKDAY, ([, name = '']) => nextWeekday(name))

  if (scanner.spans.length === 0) return literal(input)
  const title = cleanTitle(input, scanner.spans)
  if (!title) return literal(input)

  let date = explicitDate ?? namedDay ?? weekday ?? offsetDate ?? (part?.today ? today : null)
  // Una hora sin día que ya pasó hoy se entiende para mañana.
  if (time && !date) date = toInstant(today, time) > now ? today : addDays(today, 1)

  let duration = spokenDuration
  if (span) duration = durationFromEnd(span.start, span.end)
  else if (until && time) duration = durationFromEnd(time, until)

  const atReminders = pending.flatMap((reminder): ReminderDraft[] => {
    if ('date' in reminder) return [{ kind: 'at', at: toInstant(reminder.date, reminder.time) }]
    // "el día antes a las 8" sin día de tarea no tiene a qué referirse.
    if (reminder.daysBefore > 0 && !date) return []
    return [{ kind: 'at', at: toInstant(addDays(date ?? today, -reminder.daysBefore), reminder.time) }]
  })
  const [firstAt] = atReminders
  if (!date && firstAt?.kind === 'at') date = isoOfInstant(firstAt.at)

  const placeReminders: ReminderDraft[] = placePhrase?.place
    ? [{ kind: 'place', placeId: placePhrase.place.id, on: placePhrase.on }]
    : []
  const reminders: ReminderDraft[] = [...explicit, ...atReminders, ...placeReminders]
  const isDefault = time !== null && reminders.length === 0 && !placePhrase
  // Con hora y sin avisos pedidos, se avisa a la hora.
  if (isDefault) reminders.push({ kind: 'before', minutes: 0 })

  const draft = { title, date, time, duration, reminders }
  const label = draftLabel(draft, isDefault, now, known)
  if (!placePhrase || placePhrase.place) return { ...draft, label }
  const newPlace = { name: placePhrase.name, on: placePhrase.on }
  return { ...draft, label: withPlaceLabel(label, newPlace), newPlace }
}

/**
 * Igual que `parseTask`, pero para texto dictado: aunque no traiga fecha ni hora, se limpian
 * las muletillas ("Bueno, recuérdame…") y la puntuación que añade la transcripción, y el
 * título empieza siempre en mayúscula. Si la pregunta dictada era una petición ("¿puedes
 * recordarme…?"), sus signos no son parte de la tarea; se mira la frase original porque el
 * analizador puede haberse llevado ya la petición junto con la hora del aviso.
 */
export function parseSpoken(input: string, now: number, places: readonly Place[] | null = []): ParsedTask {
  const text = input.trim()
  const parsed = parseTask(text, now, places)
  const title = parsed.label !== null ? parsed.title : cleanTitle(parsed.title, []) || parsed.title
  return { ...parsed, title: capitalize(isRequestQuestion(text) ? unwrapQuestion(title) : title) }
}

/** Añade a la etiqueta el lugar que aún no existe: `Mañana · Al llegar a Mercadona`. */
export const withPlaceLabel = (label: string, place: { name: string; on: PlaceTrigger }) =>
  [label, placeTriggerLabel(place.name, place.on)].filter(Boolean).join(' · ')

/** `Mañana 17:00–18:00 · 1 h antes`. `isDefault`: el único aviso es el automático "a la hora". */
export function draftLabel(
  draft: Pick<TaskDraft, 'date' | 'time' | 'duration' | 'reminders'>,
  isDefault: boolean,
  now: number,
  places: readonly Place[] = [],
): string {
  const { date, time, duration, reminders } = draft
  const today = isoOfInstant(now)
  const parts: string[] = []
  if (date) parts.push(relativeLabel(date, today))
  if (time) parts.push(spanLabel(time, duration))
  // Sin hora la duración no tiene de dónde colgar, pero sí dice algo: "Reunión · 2 h".
  else if (duration !== null) parts.push(durationLabel(duration))

  const extras = isDefault
    ? []
    : reminders.map((reminder) =>
        reminder.kind === 'at' && !time ? shortTime(timeOfInstant(reminder.at)) : reminderLabel(reminder, now, places),
      )
  if (!time && extras.length && reminders[0]?.kind === 'at') {
    // "en 30 min": la hora del aviso es lo que da sentido a la etiqueta.
    parts.push(extras.shift() ?? '')
  }
  return [parts.join(' '), ...extras].filter(Boolean).join(' · ')
}
