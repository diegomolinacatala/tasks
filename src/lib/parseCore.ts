import type { IsoDate, IsoTime, Place, PlaceTrigger, ReminderDraft, TaskDraft } from '../types'
import { addDays, isoOfInstant, relativeLabel, shortTime, timeOfInstant, toInstant } from './date'
import { MAX_DURATION, MIN_DURATION, durationFromEnd, durationLabel, spanLabel } from './duration'
import type { NormalizedText } from './normalize'
import { originalSpan } from './normalize'
import type { PlacePhrase } from './placePhrase'
import { placeTriggerLabel } from './places'
import { reminderLabel } from './reminders'
import type { Span } from './title'

/**
 * Lo que comparten los analizadores de cada idioma (`parse.ts` en español, `parseEn.ts` en inglés):
 * el escáner que reconoce tramos sin pisarlos y cómo se monta la tarea con lo reconocido. Cada idioma
 * pone sus expresiones; las reglas (una hora sin día que ya pasó es de mañana, con hora y sin avisos
 * se avisa a la hora…) son las mismas.
 */

export interface ParsedTask extends TaskDraft {
  /** Resumen de lo detectado (`Mañana 17:00 · 10 min antes`), o `null` si no se detectó nada. */
  label: string | null
}

export const MINUTE = 60_000

/** Palabra completa: sin letras ni dígitos pegados a los lados. */
export const word = (source: string) => new RegExp(`(?<![a-z0-9])(?:${source})(?![a-z0-9])`, 'g')

/** Grupos de captura de una expresión: para saber dónde empiezan los de la siguiente pieza. */
export const groupCount = (source: string): number => (new RegExp(`${source}|`).exec('')?.length ?? 1) - 1

/** Aviso a una hora concreta que depende del día de la tarea (`daysBefore`) o tiene el suyo. */
export type PendingAt = { time: IsoTime; daysBefore: number } | { time: IsoTime; date: IsoDate }

/** Una duración es un rato del día: "de tres días" no lo es y se queda en el título. */
export function durationMinutes(minutes: number | null): number | null {
  if (minutes === null) return null
  const rounded = Math.round(minutes)
  return rounded >= MIN_DURATION && rounded <= MAX_DURATION ? rounded : null
}

export class Scanner {
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

  /** Avisos encadenados ("y otra vez a las 9"): solo cuentan pegados a un aviso ya reconocido. */
  chained(regex: RegExp, firstReminder: number, read: (match: RegExpExecArray) => IsoTime | null): IsoTime[] {
    const found: IsoTime[] = []
    for (;;) {
      const reminderEnds = this.ends.slice(firstReminder)
      const nextTo = (index: number) => reminderEnds.some((end) => index - end >= 0 && index - end <= 2)
      const time = this.first(regex, read, nextTo)
      if (time === null) return found
      found.push(time)
    }
  }
}

export const literal = (input: string): ParsedTask => ({
  title: input.trim(),
  date: null,
  time: null,
  duration: null,
  reminders: [],
  label: null,
})

/** Lo que un analizador ha reconocido en la frase, ya resuelto a fechas, horas y minutos. */
export interface Extracted {
  placePhrase: PlacePhrase | null
  /** Avisos que no dependen del día de la tarea ("en 30 min", "10 minutos antes"). */
  explicit: ReminderDraft[]
  pending: PendingAt[]
  /** Día que se deduce de un plazo ("en 3 días", "en 2 horas" que cae mañana). */
  offsetDate: IsoDate | null
  span: { start: IsoTime; end: IsoTime } | null
  until: IsoTime | null
  duration: number | null
  date: IsoDate | null
  /** "Esta noche" o "tonight": la franja y si es de hoy. */
  part: { time: IsoTime | null; today: boolean } | null
  time: IsoTime | null
  namedDay: IsoDate | null
  weekday: IsoDate | null
}

/**
 * Monta la tarea con lo reconocido: el título es lo que queda del original sin los tramos
 * (`cleanTitle`), y las reglas de siempre deciden día, duración y avisos.
 */
export function assemble(
  input: string,
  now: number,
  scanner: Scanner,
  found: Extracted,
  cleanTitle: (original: string, spans: readonly Span[]) => string,
  places: readonly Place[],
): ParsedTask {
  if (scanner.spans.length === 0) return literal(input)
  const title = cleanTitle(input, scanner.spans)
  if (!title) return literal(input)

  const today = isoOfInstant(now)
  const { placePhrase, explicit, pending, span, until, time } = found
  let date = found.date ?? found.namedDay ?? found.weekday ?? found.offsetDate ?? (found.part?.today ? today : null)
  // Una hora sin día que ya pasó hoy se entiende para mañana.
  if (time && !date) date = toInstant(today, time) > now ? today : addDays(today, 1)

  let duration = found.duration
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
  const label = draftLabel(draft, isDefault, now, places)
  if (!placePhrase || placePhrase.place) return { ...draft, label }
  const newPlace = { name: placePhrase.name, on: placePhrase.on }
  return { ...draft, label: withPlaceLabel(label, newPlace), newPlace }
}

/** "En 30 min" pone un aviso a esa hora; "en 3 días", solo el día. */
export function readOffset(offset: number | null, now: number, dayMinutes: number): { reminder: ReminderDraft | null; date: IsoDate | null } {
  if (offset === null) return { reminder: null, date: null }
  if (offset >= dayMinutes && offset % dayMinutes === 0) return { reminder: null, date: addDays(isoOfInstant(now), offset / dayMinutes) }
  const at = Math.ceil((now + offset * MINUTE) / MINUTE) * MINUTE
  return { reminder: { kind: 'at', at }, date: isoOfInstant(at) }
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
