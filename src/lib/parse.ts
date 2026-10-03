import type { Place } from '../types'
import { addDays, isoOfInstant, startOfWeek } from './date'
import { language } from './i18n'
import { normalizeText } from './normalize'
import type { ParsedTask, PendingAt } from './parseCore'
import { Scanner, assemble, durationMinutes, literal, readOffset, word } from './parseCore'
import type * as EnglishParser from './parseEn'
import { placePhraseRegex, readPlacePhrase } from './placePhrase'
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

export type { ParsedTask } from './parseCore'
export { draftLabel, withPlaceLabel } from './parseCore'

/**
 * Lo escrito o dictado → tarea: título, día, hora, duración y avisos. Cada idioma tiene su analizador
 * (este, el español; `parseEn.ts`, el inglés) sobre el mismo motor (`parseCore.ts`), y manda el
 * idioma de la app.
 */

/**
 * El inglés va en su propio trozo: solo lo descarga quien usa la app en inglés (`LanguageProvider` lo
 * pide al elegirlo) y `headless.js` lo lleva dentro. Hasta que llega, lo escrito se queda literal.
 */
let english: typeof EnglishParser | null = null

export function provideEnglish(parser: typeof EnglishParser): void {
  english = parser
}

export const hasEnglish = (): boolean => english !== null

export const loadEnglish = (): Promise<void> => (english ? Promise.resolve() : import('./parseEn').then(provideEnglish))

/** Una frase con un poco de todo: al analizarla, el motor compila sus expresiones. */
const WARM_UP = { es: 'llamar a Ana mañana a las 5 durante una hora y recuérdamelo 10 minutos antes', en: 'call Ana tomorrow at 5pm for an hour and remind me 10 minutes before' }

/**
 * Compila de antemano las expresiones del analizador (la primera vez que se usa una cuesta), en un
 * rato libre tras el arranque: así la primera tecla en la barra de escribir no espera a nada.
 */
export function warmUpParser(now: number): void {
  parseTask(WARM_UP[language()], now, [])
}

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

/** Una duración es un rato del día: "de tres días" no lo es y se queda en el título. */
const durationAmount = (groups: readonly (string | undefined)[]) => durationMinutes(amountOf(groups))

/**
 * Hora dentro de un tramo ("de 5 a 7"): el propio tramo ya dice que son horas, así que se
 * resuelve como si llevara "a las" delante, con su misma regla de tarde ("a las 5" es 17:00).
 */
const spanHour = (groups: readonly (string | undefined)[], hint?: string) =>
  resolveHour(['a las ', ...groups.slice(1)], hint)

/** Franja dicha al final del tramo ("de 9 a 11 de la noche"): puede valer también para el inicio. */
function spanHint(groups: readonly (string | undefined)[]): string | undefined {
  const [, , , , , , , part, noon, meridiem] = groups
  if (part ?? noon) return part ?? noon
  if (meridiem) return meridiem === 'pm' ? 'tarde' : 'manana'
  return undefined
}

/** Extrae fecha, hora y avisos de un texto en español. Si no queda título, lo deja literal. */
function parseTaskEs(input: string, now: number, places: readonly Place[] | null): ParsedTask {
  const today = isoOfInstant(now)
  const scanner = new Scanner(normalizeText(input))
  const nextWeekday = (name: string) => addDays(today, (WEEKDAYS.indexOf(name) - new Date(now).getDay() + 7) % 7 || 7)
  const dayWord = (value: string) => addDays(today, value === 'hoy' ? 0 : value === 'manana' ? 1 : 2)

  // El lugar va primero: se lleva la petición que lo acompaña ("recuérdame al pasar por…").
  const known = places ?? []
  const placePhrase =
    places === null
      ? null
      : scanner.firstSized(placePhraseRegex(REMIND_VERB, known), (match) => {
          const phrase = readPlacePhrase(match, scanner.normalized, input, known)
          return { value: phrase, length: phrase.length }
        })

  const offset = readOffset(
    scanner.first(RE_OFFSET, (match) => amountOf(match.slice(1))),
    now,
    DAY_MINUTES,
  )
  const explicit = offset.reminder ? [offset.reminder] : []
  const pending: PendingAt[] = []

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
  explicit.push(...before.map((minutes) => ({ kind: 'before' as const, minutes: Math.round(minutes) })))
  if (scanner.first(RE_REMIND_ON_TIME, () => true)) explicit.push({ kind: 'before', minutes: 0 })
  const atTime = (match: RegExpExecArray) => (match[1] ? resolveHour(match.slice(1)) : null)
  pending.push(...scanner.all(RE_REMIND_AT, atTime).map((time) => ({ time, daysBefore: 0 })))
  pending.push(...scanner.chained(RE_CHAIN_AT, firstReminder, atTime).map((time) => ({ time, daysBefore: 0 })))

  // Cuánto dura, después de los avisos ("una hora antes" es un aviso, no una duración) y antes
  // de la hora, para que un tramo se quede con sus dos horas en vez de dejar solo la primera.
  const span = scanner.first(RE_SPAN, (match) => {
    const from = match.slice(2, 12)
    const to = match.slice(13, 23)
    // "de 5 a 7" son horas si alguna lleva "las" o si por sí sola ya se lee como hora ("17:30").
    const marked = Boolean(match[1] ?? match[12]) || resolveHour(from) !== null || resolveHour(to) !== null
    if (!marked) return null
    const end = spanHour(to)
    // "de 9 a 11 de la noche" empieza a las 21:00; "de 10 a 2 de la tarde", a las 10:00: la franja
    // del final solo pasa al inicio si el tramo sigue yendo hacia delante.
    const hint = spanHint(to)
    const hinted = hint ? spanHour(from, hint) : null
    const start = hinted && end && hinted < end ? hinted : spanHour(from)
    return start && end ? { start, end } : null
  })
  const until = span ? null : scanner.first(RE_UNTIL, (match) => spanHour(match.slice(1)))
  const duration =
    scanner.first(RE_DURATION_OF, (match) => durationAmount(match.slice(1))) ??
    scanner.first(RE_DURATION, (match) => durationAmount(match.slice(1)))

  const date =
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

  const found = { placePhrase, explicit, pending, offsetDate: offset.date, span, until, duration, date, part, time, namedDay, weekday }
  return assemble(input, now, scanner, found, cleanTitle, known)
}

/**
 * Extrae fecha, hora y avisos de lo escrito, en el idioma de la app. Si no queda título, lo deja
 * literal. `places`: lugares guardados ("al llegar a la universidad"); `null` = la plataforma no
 * tiene avisos por lugar (la PWA): esas frases se dejan como están.
 */
export function parseTask(input: string, now: number, places: readonly Place[] | null = []): ParsedTask {
  if (language() !== 'en') return parseTaskEs(input, now, places)
  return english ? english.parseTaskEn(input, now, places) : literal(input)
}

/**
 * Igual que `parseTask`, pero para texto dictado: aunque no traiga fecha ni hora, se limpian
 * las muletillas ("Bueno, recuérdame…") y la puntuación que añade la transcripción, y el
 * título empieza siempre en mayúscula. Si la pregunta dictada era una petición ("¿puedes
 * recordarme…?"), sus signos no son parte de la tarea; se mira la frase original porque el
 * analizador puede haberse llevado ya la petición junto con la hora del aviso.
 */
export function parseSpoken(input: string, now: number, places: readonly Place[] | null = []): ParsedTask {
  if (language() === 'en') return english ? english.parseSpokenEn(input, now, places) : literal(input)
  const text = input.trim()
  const parsed = parseTaskEs(text, now, places)
  const title = parsed.label !== null ? parsed.title : cleanTitle(parsed.title, []) || parsed.title
  return { ...parsed, title: capitalize(isRequestQuestion(text) ? unwrapQuestion(title) : title) }
}
