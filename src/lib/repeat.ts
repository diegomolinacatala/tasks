import type { IsoTime } from '../types'
import { shortTime } from './date'
import type { Language } from './i18n'
import { language } from './i18n'
import type { NumberWords } from './normalize'
import { ENGLISH_NUMBERS, SPANISH_NUMBERS, normalizeText, originalSpan } from './normalize'
import { isoOfInstant } from './date'
import { parseTask } from './parse'
import { ALL_DAYS, WEEKEND, WORKDAYS, cleanDays, daysLabel, isoWeekday } from './routines'
import type { Span } from './title'
import { capitalize } from './title'
import { PART_OF_DAY } from './when'
import { PART_OF_DAY_EN } from './whenEn'

/**
 * "Tomar creatina todos los días a las 10", "gimnasio los lunes y jueves", "regar entre semana":
 * lo que se repite no es una tarea, es una rutina. Se reconoce la frase de repetición, se quita del
 * texto y lo que queda se analiza como siempre para sacar la hora. "El lunes" es un día; "los
 * lunes", todos. En inglés, igual: "every day at 10", "on mondays and thursdays", "weekdays".
 */

export interface RoutineDraft {
  title: string
  days: number[]
  time: IsoTime | null
  /** `Cada día · 10:00`. */
  label: string
}

const word = (source: string) => new RegExp(`(?<![a-z0-9])(?:${source})(?![a-z0-9])`, 'g')

interface Pattern {
  regex: RegExp
  /** Vacío en "cada semana": el día lo pone lo que se diga además ("el martes") o, si nada, hoy. */
  days: (match: RegExpExecArray) => readonly number[]
  /** La franja ("todas las mañanas"), que da además la hora. */
  part?: (match: RegExpExecArray) => string | undefined
}

/** Los días que nombra el texto, de 1 (lunes) a 7 (domingo). */
const namedDays = (text: string, numbers: Readonly<Record<string, number>>) =>
  text.split(/[^a-z]+/).flatMap((name) => (numbers[name] ? [numbers[name]] : []))

const WEEKDAY_NUMBER: Record<string, number> = {
  lunes: 1,
  martes: 2,
  miercoles: 3,
  jueves: 4,
  viernes: 5,
  sabado: 6,
  sabados: 6,
  domingo: 7,
  domingos: 7,
}
const DAY_NAME = 'lunes|martes|miercoles|jueves|viernes|sabados?|domingos?'

const WEEKDAY_NUMBER_EN: Record<string, number> = {
  monday: 1,
  mondays: 1,
  mon: 1,
  tuesday: 2,
  tuesdays: 2,
  tue: 2,
  tues: 2,
  wednesday: 3,
  wednesdays: 3,
  wed: 3,
  thursday: 4,
  thursdays: 4,
  thu: 4,
  thur: 4,
  thurs: 4,
  friday: 5,
  fridays: 5,
  fri: 5,
  saturday: 6,
  saturdays: 6,
  sat: 6,
  sunday: 7,
  sundays: 7,
  sun: 7,
}
const DAY_NAME_EN = 'mondays?|tuesdays?|wednesdays?|thursdays?|fridays?|saturdays?|sundays?'
const DAY_SHORT_EN = 'mon|tues?|wed|thu(?:rs?)?|fri|sat|sun'

/**
 * Cada patrón con los días que dice; los de franja ("todas las mañanas") dan además la hora. Van de
 * lo más concreto a lo más general: "todos los días laborables" no es "todos los días".
 */
const PATTERNS: Record<Language, Pattern[]> = {
  es: [
    { regex: word('entre semana|de lunes a viernes|(?:todos )?los dias laborables|cada dia laborable|los laborables'), days: () => WORKDAYS },
    { regex: word('(?:todos )?los fines de semana|cada fin de semana|(?:todos )?los findes|cada finde'), days: () => WEEKEND },
    {
      regex: word('(?:todas las|cada) (mananas|tardes|noches|manana|tarde|noche)'),
      days: () => ALL_DAYS,
      part: (match) => match[1]?.replace(/s$/, ''),
    },
    { regex: word('todos los dias|cada dia|a diario|diariamente'), days: () => ALL_DAYS },
    { regex: word('cada semana|todas las semanas|semanalmente|una vez (?:a|por) semana'), days: () => [] },
    {
      // "cada lunes", "todos los martes", "los lunes y jueves", "los lunes, miércoles y viernes".
      regex: word(`(?:cada|todos los|todas las|los) (?:${DAY_NAME})(?:(?:, ?| y | e )(?:los )?(?:${DAY_NAME}))*`),
      days: (match) => namedDays(match[0], WEEKDAY_NUMBER),
    },
  ],
  en: [
    {
      regex: word('(?:every|each|on|all) (?:weekday|work ?day|business day)s?|weekdays|(?:from )?monday (?:to|through|thru) friday|mon-fri'),
      days: () => WORKDAYS,
    },
    { regex: word('(?:every|each|on|all) weekends?|weekends'), days: () => WEEKEND },
    {
      regex: word('(?:every|each) (morning|afternoon|evening|night)|(mornings|evenings|nights)'),
      days: () => ALL_DAYS,
      part: (match) => (match[1] ?? match[2])?.replace(/s$/, ''),
    },
    { regex: word('every ?day|each day|daily|every single day'), days: () => ALL_DAYS },
    { regex: word('every week|each week|weekly|once a week'), days: () => [] },
    {
      // "every monday", "on mondays and thursdays", "every mon, wed and fri". "On monday" es un día.
      regex: word(
        `(?:(?:every|each) (?:${DAY_NAME_EN}|${DAY_SHORT_EN})|(?:on )?(?:mondays|tuesdays|wednesdays|thursdays|fridays|saturdays|sundays))` +
          `(?:(?:, ?|,? and |,? & )(?:every |on )?(?:${DAY_NAME_EN}|${DAY_SHORT_EN}))*`,
      ),
      days: (match) => namedDays(match[0], WEEKDAY_NUMBER_EN),
    },
  ],
}

const NUMBERS: Record<Language, NumberWords> = { es: SPANISH_NUMBERS, en: ENGLISH_NUMBERS }
const PARTS: Record<Language, Readonly<Record<string, IsoTime>>> = { es: PART_OF_DAY, en: PART_OF_DAY_EN }

/**
 * Quita los tramos y junta lo que queda. Los conectores ("a las 10") se quedan: son de la hora, que
 * se analiza después y ya los limpia.
 */
function cut(input: string, spans: readonly Span[]): string {
  return [...spans]
    .sort((a, b) => b.start - a.start)
    .reduce((text, span) => `${text.slice(0, span.start)} ${text.slice(span.end)}`, input)
    .replace(/\s+/g, ' ')
    .replace(/\s+([,.;:])/g, '$1')
    .replace(/^[\s,.;:]+|[\s,.;:]+$/g, '')
}

/** La frase de repetición del texto, si la hay: los días y el texto sin ella. */
export function readRepeat(input: string): { days: number[]; rest: string; part: string | null } | null {
  const lang = language()
  const normalized = normalizeText(input, NUMBERS[lang])
  const spans: Span[] = []
  const days: number[] = []
  let part: string | null = null

  for (const { regex, days: read, part: readPart } of PATTERNS[lang]) {
    for (const match of normalized.text.matchAll(regex)) {
      const span = originalSpan(normalized, match.index, match.index + match[0].length)
      if (spans.some((other) => span.start < other.end && span.end > other.start)) continue
      spans.push(span)
      days.push(...read(match as RegExpExecArray))
      part ??= readPart?.(match as RegExpExecArray) ?? null
    }
  }
  if (!spans.length) return null
  // Solo "cada semana", sin días: los decide quien la lee (`parseRoutine`). Vacío no es "todos".
  return { days: days.length ? cleanDays(days) : [], rest: cut(input, spans), part }
}

/** La rutina que describe el texto, o `null` si no dice que se repita o no queda título. */
export function parseRoutine(input: string, now: number): RoutineDraft | null {
  const repeat = readRepeat(input)
  if (!repeat?.rest) return null
  // La hora sale del analizador de siempre; el día que calcule no cuenta: se repite.
  const parsed = parseTask(repeat.rest, now, null)
  const title = capitalize(parsed.title.trim())
  if (!title) return null
  const time = parsed.time ?? (repeat.part ? (PARTS[language()][repeat.part] ?? null) : null)
  // "Bici cada semana el martes": el día dicho; sin él, el de hoy.
  const days = repeat.days.length ? repeat.days : [isoWeekday(parsed.date ?? isoOfInstant(now))]
  return { title, days, time, label: routineLabel(days, time) }
}

/** `Cada día · 10:00`, `Los lunes` · `Every day · 10:00 AM`, `Mondays`. */
export const routineLabel = (days: readonly number[], time: IsoTime | null): string =>
  [daysLabel(days), time ? shortTime(time) : ''].filter(Boolean).join(' · ')
