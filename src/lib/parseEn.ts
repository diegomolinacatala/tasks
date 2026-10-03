import type { Place } from '../types'
import { addDays, isoOfInstant, startOfWeek } from './date'
import { ENGLISH_NUMBERS, normalizeText } from './normalize'
import type { ParsedTask, PendingAt } from './parseCore'
import { Scanner, assemble, durationMinutes, groupCount, readOffset, word } from './parseCore'
import { readPlacePhrase } from './placePhrase'
import { placeKey } from './places'
import type { Span, TitleRules } from './title'
import { capitalize, cleanTitle, isRequestQuestion, unwrapQuestion } from './title'
import { resolveDay, resolveDayOfMonth } from './when'
import {
  AMOUNT_SOURCE_EN,
  MONTH_SOURCE,
  PART_OF_DAY_EN,
  TIME_SOURCE_EN,
  WEEKDAY_SOURCE,
  amountOfEn,
  monthNumber,
  resolveHourEn,
  weekdayIndex,
} from './whenEn'

/**
 * El analizador en inglés: lo mismo que `parse.ts` entiende en español ("call mom tomorrow at 5pm",
 * "dentist on Oct 15 for an hour, remind me 30 minutes before", "when I get to Walmart"), sobre el
 * mismo motor (`parseCore.ts`). Las fechas numéricas van como en Estados Unidos: mes/día.
 */

const DAY_MINUTES = 24 * 60
const TIME_GROUPS = groupCount(TIME_SOURCE_EN)
const AMOUNT_GROUPS = groupCount(AMOUNT_SOURCE_EN)
const WD = WEEKDAY_SOURCE
const ORDINAL = '(?:st|nd|rd|th)?'

/** "remind me", "can you remind me", "and alert me", "with a reminder": introduce un recordatorio. */
const REMIND_VERB =
  '(?:and |, ?)?(?:please )?(?:(?:can|could|would|will) you )?(?:please )?' +
  '(?:remind me|alert me|notify me|ping me|let me know|set (?:a |an )?(?:reminder|alert|alarm)|with (?:a |an )?(?:reminder|alert))' +
  '(?: about it| about that| of it)?'

/** "in 30 minutes". Sin la petición: "remind me in 10 minutes to call Ana" deja "remind me to…", que el título limpia. */
const RE_OFFSET = word(`in (?:${AMOUNT_SOURCE_EN})`)
/** "the day before at 8", "2 days before at 10", "the night before at 9". */
const RE_REMIND_DAYS_BEFORE_AT = word(
  `(?:${REMIND_VERB} )?(?:(?:the|1) day before|(\\d) days before|(the (?:night|evening) before)) ${TIME_SOURCE_EN}`,
)
/** "remind me in the morning", "remind me the day before in the evening", "remind me on friday at noon". */
const RE_REMIND_PART = word(
  `${REMIND_VERB} (?:(?:(the day before|1 day before)|(?:on )?(${WD})|((?:the )?day after tomorrow|tomorrow|today)) )?` +
    '(?:in the (morning|afternoon|evening)|at (night|noon|midday)|(first thing)(?: in the morning)?|(tonight)|the (night) before)',
)
const RE_REMIND_BEFORE = word(
  `(?:${REMIND_VERB} )?(?:(?:${AMOUNT_SOURCE_EN})|the (day)) (?:before|beforehand|earlier|early|ahead|in advance|prior)`,
)
const RE_REMIND_ON_TIME = word(`${REMIND_VERB} (?:on time|at the time|when it starts|right when it starts)`)
const RE_REMIND_AT = word(`${REMIND_VERB} ${TIME_SOURCE_EN}`)
/** "remind me an hour before and at 9", "at 7:30 and again at 7:50": pegado a otro aviso. */
const RE_CHAIN_AT = word(`and (?:again )?${TIME_SOURCE_EN}`)
const RE_NEXT_WEEK_DAY = word(`(?:on )?(${WD})(?: of)? next week|next week,? (?:on )?(${WD})`)
/** "next week" sin día: su lunes. "this weekend": el sábado que viene (o hoy, si ya es fin de semana). */
const RE_NEXT_WEEK = word('next week')
const RE_WEEKEND = word('(?:this |on the |this coming )?(next )?weekend')
const RE_DATE_MONTH_FIRST = word(`(?:on |by |before )?(${MONTH_SOURCE})\\.? (?:the )?(\\d{1,2})${ORDINAL}(?:,? (\\d{4}))?`)
const RE_DATE_DAY_FIRST = word(`(?:on |by |before )?(?:the )?(\\d{1,2})${ORDINAL} (?:of )?(${MONTH_SOURCE})\\.?(?:,? (\\d{4}))?`)
/** Mes/día, como se escribe en Estados Unidos: "10/15", "10/15/2027". */
const RE_DATE_NUMERIC = word('(?:on |by )?(\\d{1,2})/(\\d{1,2})(?:/(\\d{4}|\\d{2}))?')
const RE_WEEKDAY_NUMBER = word(
  `(?:on )?(${WD}),? (?:the )?(\\d{1,2})${ORDINAL}(?! ?(?::|\\.\\d|am|pm|a\\.m|p\\.m|o'clock|h(?![a-z])|minutes?|mins?|hours?|hrs?|days?|weeks?))`,
)
/** "on the 22nd", "by the 5th", "the 15th". Un número suelto ("the 5") no es un día. */
const RE_DAY_OF_MONTH = word(`(?:on|by|before) the (\\d{1,2})${ORDINAL}|the (\\d{1,2})(?:st|nd|rd|th)`)
/** "for an hour", "lasting 45 minutes", "that lasts half an hour". */
const RE_DURATION = word(`(?:for|lasting|that lasts|which lasts|lasts) (?:about |around )?(?:${AMOUNT_SOURCE_EN})`)
/** "a 2-hour meeting", "30-minute call", "an hour-long class": el rato como adjetivo. */
const RE_DURATION_ADJ = word(
  '(?:an? )?(\\d{1,3}(?:\\.\\d)?)-(minute|min|hour|hr)s?(?:-long)?|an? (\\d{1,3}(?:\\.\\d)?) (minute|min|hour|hr)s?(?:[- ]long)?(?= [a-z])|an (hour)[- ]long',
)
/** "from 5 to 7", "between 9 and 11", "5-7pm", "9am to 5pm": a qué hora empieza y a cuál acaba. */
const RE_SPAN = word(`(from |between )?${TIME_SOURCE_EN} ?(to|till|until|til|through|-|–|and) ?${TIME_SOURCE_EN}`)
/** "until 7", "till 7:30pm": la hora de acabar; la de empezar es la de la tarea. */
const RE_UNTIL = word(`(?:until|till|til|up to) ${TIME_SOURCE_EN}`)
const RE_TIME = word(TIME_SOURCE_EN)
/**
 * "this morning", "tonight", "at noon". "In the morning" y "at night" detrás de una hora son de la
 * hora ("at 7 in the morning"), que los lleva consigo.
 */
const AFTER_TIME = "(?<!\\d |\\d[ap]m |\\d [ap]m |\\d[ap]\\.m\\. |\\d [ap]\\.m\\. |o'clock )"
const RE_PART = word(
  `(this) (morning|afternoon|evening)|${AFTER_TIME}in the (morning|afternoon|evening)|(tonight)|${AFTER_TIME}(?:at|around) (night)` +
    '|(?:at|around) (noon|midday|midnight)|(first thing)(?: in the morning)?' +
    // "tomorrow morning", "friday night": la franja va detrás del día, que se lee aparte.
    `|(?<=(?:today|tomorrow|tmrw|tmr|${WD}) )(morning|afternoon|evening|night)`,
)
const RE_DAY_WORD = word('(?:the )?day after tomorrow|tomorrow|tmrw|tmr|today')
const RE_WEEKDAY = word(`(?:on |this |next |this coming |coming )?(${WD})`)

type Groups = readonly (string | undefined)[]

/** Una hora dentro de un tramo ("from 5 to 7"): el tramo ya dice que son horas, como si llevara "at". */
const spanHour = (groups: Groups, hint?: string) => resolveHourEn(['at ', ...groups.slice(1)], hint)

/** La franja dicha al final del tramo ("from 9 to 11 at night", "5-7pm") puede valer para el inicio. */
function spanHint(groups: Groups): string | undefined {
  const [, , , , meridiem, , part, night] = groups
  if (part ?? night) return part ?? night
  if (meridiem) return meridiem.startsWith('p') ? 'evening' : 'morning'
  return undefined
}

const durationAmount = (groups: Groups) => durationMinutes(amountOfEn(groups))

function adjectiveDuration([, number, unit, spaced, spacedUnit, hourLong]: Groups): number | null {
  if (hourLong) return 60
  const amount = Number(number ?? spaced)
  const per = (unit ?? spacedUnit ?? '').startsWith('h') ? 60 : 1
  return durationMinutes(amount * per)
}

// ── Lugares ──────────────────────────────────────────────────────────────

/** Palabras que no pueden abrir ni continuar un nombre de lugar sin guardar. */
const STOP =
  '(?:to|that|and|at|for|by|with|on|in|before|after|today|tomorrow|tonight|the|my|a|an|remind|me|i|so|then|from|of|is|it|please)(?![a-z0-9])'
const GENERIC = `(?!${STOP})[a-z0-9]+(?: (?!${STOP})[a-z0-9]+){0,3}`
/** Tras el lugar: "…Walmart to buy milk". */
const CONNECTOR = /^ (?:and )?to(?= [a-z])/
const ARRIVE = "get to|get back to|get back(?= home)|get(?= home)|arrive at|arrive in|arrive|reach|pass by|pass|go by|go past|go to|at|near|in"
const LEAVE = 'leave|leaving|left|get out of|exit'

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** "when I get to Walmart", "remind me when I'm at the office", "when I leave home". */
function placePhraseRegex(places: readonly Place[]): RegExp {
  const names = [...new Set(places.map((place) => escape(placeKey(place.name))).filter(Boolean))].sort((a, b) => b.length - a.length)
  const target = names.length ? `(?:(${names.join('|')})|(${GENERIC}))` : `(?:()(${GENERIC}))`
  return new RegExp(
    `(?<![a-z0-9])(?:${REMIND_VERB} )?(?:when|once|as soon as|whenever|after) (?:i |i'm |i am )?(?:(${ARRIVE})|(${LEAVE})) ` +
      `(?:(the|my) )?${target}(?![a-z0-9])`,
    'g',
  )
}

// ── Título ───────────────────────────────────────────────────────────────

const LEADING = new RegExp(
  `^(?:${[
    'ok(?:ay)?',
    'hey(?: siri)?',
    'hi',
    'so',
    'well',
    'um+',
    'uh+',
    'oh',
    'alright',
    'all right',
    'please',
    '(?:(?:can|could|would|will) you )?(?:please )?remind me (?:to|that|about|of)',
    '(?:(?:can|could|would|will) you )?(?:please )?remind me',
    "(?:don't|do not) (?:let me )?forget (?:to|that|about)",
    '(?:i )?(?:need|have|got|ought) to',
    "i've got to",
    "i(?:'ve)? gotta",
    'gotta',
    'i (?:must|should)',
    'must',
    'should',
    'i want to',
    "i'd like to",
    'i would like to',
    "i'm (?:going to|gonna)",
    'i am going to',
    "i'll",
    'i will',
    'make sure (?:to|that|i)',
    "let's",
    'let me',
    '(?:(?:can|could|would|will) you )?(?:please )?(?:add|create|make)(?: a)?(?: new)? task(?: to| for)?',
    'new task(?: to| for)?',
    '(?:add|note|write down|put down)(?: that)?',
    "(?:i have|i've got|i got|there's|there is) (?:a|an|the|my)",
    // "go to the post office to mail a package": lo que cuenta es lo que se va a hacer.
    '(?:go|going|head|heading) to (?:the )?[a-z]+(?: [a-z]+)? to(?= [a-z]+)',
    '(?:go|going|head|heading) to(?: a| an| the| my)?',
    '(?:attend|attending) (?:a|an|the)',
  ].join('|')})[,.:;]?\\s+`,
)

export const ENGLISH_TITLE: TitleRules = {
  leading: LEADING,
  // Al final también la petición que se queda sola: "call Ana, remind me in 10 minutes" → "call Ana".
  // "in", "on" y "of" no se quitan del final: son de la tarea ("check in", "log on").
  connectors: /^(?:(?:and|to|at|on|by|for|of|in|,)\s+)+|(?:\s+(?:and|to|at|by|for|the|,|remind me|alert me))+$/i,
  /** "Can you remind me to call Ana?": pregunta entera, con lo de dentro aparte. */
  question: /^\s*([^?!]+?)\s*[?!]+$/,
}

const cleanTitleEn = (original: string, spans: readonly Span[]) => cleanTitle(original, spans, ENGLISH_TITLE)

// ── Analizador ───────────────────────────────────────────────────────────

/** Extrae fecha, hora y avisos de un texto en inglés. Si no queda título, lo deja literal. */
export function parseTaskEn(input: string, now: number, places: readonly Place[] | null): ParsedTask {
  const today = isoOfInstant(now)
  const scanner = new Scanner(normalizeText(input, ENGLISH_NUMBERS))
  const nextWeekday = (name: string) => addDays(today, (weekdayIndex(name) - new Date(now).getDay() + 7) % 7 || 7)
  const dayWord = (value: string) => addDays(today, value === 'today' ? 0 : value.endsWith('after tomorrow') ? 2 : 1)

  // El lugar va primero: se lleva la petición que lo acompaña ("remind me when I get to…").
  const known = places ?? []
  const placePhrase =
    places === null
      ? null
      : scanner.firstSized(placePhraseRegex(known), (match) => {
          const phrase = readPlacePhrase(match, scanner.normalized, input, known, CONNECTOR)
          return { value: phrase, length: phrase.length }
        })

  const offset = readOffset(
    scanner.first(RE_OFFSET, (match) => amountOfEn(match.slice(1))),
    now,
    DAY_MINUTES,
  )
  const explicit = offset.reminder ? [offset.reminder] : []
  const pending: PendingAt[] = []

  // Los recordatorios van antes que la hora: "remind me at 4" no es la hora de la tarea.
  const firstReminder = scanner.ends.length
  pending.push(
    ...scanner.all(RE_REMIND_DAYS_BEFORE_AT, (match): PendingAt | null => {
      const time = resolveHourEn(match.slice(3), match[2] ? 'night' : undefined)
      return time ? { time, daysBefore: match[1] ? Number(match[1]) : 1 } : null
    }),
    ...scanner.all(RE_REMIND_PART, ([, dayBefore, weekday, day, inThe, at, first, tonight, nightBefore]): PendingAt | null => {
      const key = inThe ?? at ?? (first ? 'first thing' : undefined) ?? tonight ?? nightBefore ?? ''
      const time = PART_OF_DAY_EN[key]
      if (!time) return null
      if (weekday) return { time, date: nextWeekday(weekday) }
      if (day) return { time, date: dayWord(day) }
      if (tonight) return { time, date: today }
      return { time, daysBefore: dayBefore || nightBefore ? 1 : 0 }
    }),
  )
  const before = scanner.all(RE_REMIND_BEFORE, (match) => (match[AMOUNT_GROUPS + 1] ? DAY_MINUTES : amountOfEn(match.slice(1))))
  explicit.push(...before.map((minutes) => ({ kind: 'before' as const, minutes: Math.round(minutes) })))
  if (scanner.first(RE_REMIND_ON_TIME, () => true)) explicit.push({ kind: 'before', minutes: 0 })
  const atTime = (match: RegExpExecArray) => resolveHourEn(match.slice(1))
  pending.push(...scanner.all(RE_REMIND_AT, atTime).map((time) => ({ time, daysBefore: 0 })))
  pending.push(...scanner.chained(RE_CHAIN_AT, firstReminder, atTime).map((time) => ({ time, daysBefore: 0 })))

  // Cuánto dura, después de los avisos ("an hour before" es un aviso) y antes de la hora.
  const span = scanner.first(RE_SPAN, (match) => {
    const prefix = match[1]
    const from = match.slice(2, 2 + TIME_GROUPS)
    const connector = match[2 + TIME_GROUPS]
    const to = match.slice(3 + TIME_GROUPS, 3 + 2 * TIME_GROUPS)
    if (connector === 'and' && prefix !== 'between ') return null
    // "5 to 7" son horas si el tramo empieza por "from" o si alguna ya se lee como hora ("7pm").
    const marked = Boolean(prefix) || resolveHourEn(from) !== null || resolveHourEn(to) !== null
    if (!marked) return null
    const end = spanHour(to)
    // "from 9 to 11 at night" empieza a las 21:00; "from 10 to 2pm", a las 10:00: la franja del
    // final solo pasa al inicio si el tramo sigue yendo hacia delante.
    const hint = spanHint(to)
    const hinted = hint && !from[4] ? spanHour(from, hint) : null
    const start = hinted && end && hinted < end ? hinted : spanHour(from)
    return start && end ? { start, end } : null
  })
  const until = span ? null : scanner.first(RE_UNTIL, (match) => spanHour(match.slice(1)))
  const duration =
    scanner.first(RE_DURATION, (match) => durationAmount(match.slice(1))) ?? scanner.first(RE_DURATION_ADJ, adjectiveDuration)

  const date =
    scanner.first(RE_NEXT_WEEK_DAY, ([, name, other]) => {
      const weekday = weekdayIndex(name ?? other ?? '')
      return addDays(startOfWeek(today), 7 + ((weekday + 6) % 7))
    }) ??
    scanner.first(RE_DATE_MONTH_FIRST, ([, month = '', d, year]) => resolveDay(Number(d), monthNumber(month), year ? Number(year) : null, today)) ??
    scanner.first(RE_DATE_DAY_FIRST, ([, d, month = '', year]) => resolveDay(Number(d), monthNumber(month), year ? Number(year) : null, today)) ??
    scanner.first(RE_DATE_NUMERIC, ([, m, d, y]) => resolveDay(Number(d), Number(m), y ? Number(y) : null, today)) ??
    scanner.first(RE_WEEKDAY_NUMBER, ([, name = '', d]) => resolveDayOfMonth(Number(d), today, weekdayIndex(name))) ??
    scanner.first(RE_DAY_OF_MONTH, ([, d, bare]) => resolveDayOfMonth(Number(d ?? bare), today)) ??
    scanner.first(RE_NEXT_WEEK, () => addDays(startOfWeek(today), 7)) ??
    scanner.first(RE_WEEKEND, ([, next]) => {
      const weekday = new Date(now).getDay()
      if (next) return addDays(startOfWeek(today), 12)
      return weekday === 6 || weekday === 0 ? today : addDays(today, 6 - weekday)
    })

  const part = scanner.first(RE_PART, ([, thisOne, thisName, inThe, tonight, night, noon, first, afterDay]) => {
    const key = thisName ?? inThe ?? tonight ?? night ?? noon ?? afterDay ?? (first ? 'first thing' : '')
    return { key, time: PART_OF_DAY_EN[key] ?? null, today: Boolean(thisOne ?? tonight) }
  })
  // "tonight at 9": la franja decide si la hora es de mañana o de noche.
  const time = span ? span.start : (scanner.first(RE_TIME, (match) => resolveHourEn(match.slice(1), part?.key)) ?? part?.time ?? null)
  const namedDay = scanner.first(RE_DAY_WORD, ([value = '']) => dayWord(value))
  const weekday = scanner.first(RE_WEEKDAY, ([, name = '']) => nextWeekday(name))

  const found = { placePhrase, explicit, pending, offsetDate: offset.date, span, until, duration, date, part, time, namedDay, weekday }
  return assemble(input, now, scanner, found, cleanTitleEn, known)
}

/** Como `parseSpoken` en español: muletillas fuera, mayúscula inicial y sin los signos de una petición. */
export function parseSpokenEn(input: string, now: number, places: readonly Place[] | null): ParsedTask {
  const text = input.trim()
  const parsed = parseTaskEn(text, now, places)
  const title = parsed.label !== null ? parsed.title : cleanTitleEn(parsed.title, []) || parsed.title
  return { ...parsed, title: capitalize(isRequestQuestion(text, ENGLISH_TITLE) ? unwrapQuestion(title, ENGLISH_TITLE) : title) }
}
