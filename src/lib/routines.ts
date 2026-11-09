import type { IsoDate, IsoTime, Routine } from '../types'
import { addDays, fromIso, isValidTime, isoOfInstant } from './date'
import { cleanEmoji } from './emoji'
import { pick } from './i18n'
import { compareText } from './order'

/**
 * Rutinas: lo que toca ciertos días de la semana y amanece sin hacer cada uno de ellos ("tomar
 * creatina", cada día a las 10:00). No hay nada que reiniciar a medianoche: "hecha hoy" es que el
 * diario (`Routine.done`) tenga el día de hoy, así que el día nuevo empieza pendiente él solo.
 */

/** Días de la semana: 1 = lunes … 7 = domingo. */
export const ALL_DAYS: readonly number[] = [1, 2, 3, 4, 5, 6, 7]
export const WORKDAYS: readonly number[] = [1, 2, 3, 4, 5]
export const WEEKEND: readonly number[] = [6, 7]

export const MAX_ROUTINES = 50
/** Días del diario que se guardan: dan para una racha de más de un año sin engordar el estado. */
export const ROUTINE_LOG_DAYS = 400
/** Días que enseñan los puntos de cada rutina. */
export const RECENT_DAYS = 7

const DAYS = {
  es: {
    letters: ['L', 'M', 'X', 'J', 'V', 'S', 'D'],
    /** En plural: "los sábados". */
    plural: ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábados', 'domingos'],
    short: ['lun', 'mar', 'mié', 'jue', 'vie', 'sáb', 'dom'],
    every: 'Cada día',
    workdays: 'Entre semana',
    weekend: 'Fines de semana',
    only: (name: string) => `Los ${name}`,
    and: 'y',
  },
  en: {
    letters: ['M', 'T', 'W', 'T', 'F', 'S', 'S'],
    plural: ['Mondays', 'Tuesdays', 'Wednesdays', 'Thursdays', 'Fridays', 'Saturdays', 'Sundays'],
    short: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
    every: 'Every day',
    workdays: 'Weekdays',
    weekend: 'Weekends',
    only: (name: string) => name,
    and: 'and',
  },
} as const

/** Iniciales de los días, de lunes a domingo: `L M X J V S D` · `M T W T F S S`. */
export const dayLetters = (): readonly string[] => pick(DAYS).letters

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

/** Día de la semana de una fecha: 1 = lunes … 7 = domingo. */
export const isoWeekday = (iso: IsoDate): number => ((fromIso(iso).getDay() + 6) % 7) + 1

/** Días válidos, en orden y sin repetir. Si no queda ninguno, todos: una rutina siempre toca algún día. */
export function cleanDays(days: readonly unknown[]): number[] {
  const valid = [...new Set(days)].filter((day): day is number => typeof day === 'number' && Number.isInteger(day) && day >= 1 && day <= 7)
  return valid.length ? valid.sort((a, b) => a - b) : [...ALL_DAYS]
}

const sameDays = (a: readonly number[], b: readonly number[]) => a.length === b.length && a.every((day, index) => day === b[index])

export const isDue = (routine: Pick<Routine, 'days'>, date: IsoDate): boolean => routine.days.includes(isoWeekday(date))

export const isDoneOn = (routine: Pick<Routine, 'done'>, date: IsoDate): boolean => routine.done.includes(date)

/**
 * El diario con ese día hecho o sin hacer. Devuelve el mismo array si no cambia nada; si crece
 * de más, se quedan los días más recientes.
 */
export function withDay(done: readonly IsoDate[], date: IsoDate, value: boolean): IsoDate[] {
  if (done.includes(date) === value) return done as IsoDate[]
  const next = value ? [...done, date].sort() : done.filter((day) => day !== date)
  return next.length > ROUTINE_LOG_DAYS ? next.slice(-ROUTINE_LOG_DAYS) : next
}

/**
 * Días seguidos que tocaban y se hicieron, hasta hoy. Si hoy aún no está hecha, la racha sigue
 * viva hasta que acabe el día: se cuenta desde ayer. Los días que no tocan no la cortan.
 */
export function streak(routine: Pick<Routine, 'days' | 'done'>, today: IsoDate): number {
  const done = new Set(routine.done)
  let day = done.has(today) ? today : addDays(today, -1)
  let count = 0
  for (let step = 0; step < ROUTINE_LOG_DAYS; step++, day = addDays(day, -1)) {
    if (!isDue(routine, day)) continue
    if (!done.has(day)) break
    count++
  }
  return count
}

/** La racha más larga del diario (días que tocaban, seguidos y hechos). */
export function bestStreak(routine: Pick<Routine, 'days' | 'done'>, today: IsoDate): number {
  const [first] = routine.done
  if (!first) return 0
  const done = new Set(routine.done)
  let best = 0
  let run = 0
  for (let day = first; day <= today; day = addDays(day, 1)) {
    if (!isDue(routine, day)) continue
    run = done.has(day) ? run + 1 : 0
    best = Math.max(best, run)
  }
  return best
}

/**
 * De los días que tocaban en los últimos `days` (hoy incluido solo si ya está hecha), qué parte se
 * hizo, de 0 a 1. `null` si en ese tiempo no tocaba ninguno. Los días antes de crearla no cuentan.
 */
export function completionRate(routine: Pick<Routine, 'days' | 'done' | 'createdAt'>, today: IsoDate, days = 30): number | null {
  const done = new Set(routine.done)
  const created = createdOn(routine)
  let due = 0
  let hits = 0
  for (let offset = 0; offset < days; offset++) {
    const day = addDays(today, -offset)
    if (day < created && !done.has(day)) break
    if (!isDue(routine, day) || (day === today && !done.has(day))) continue
    due++
    if (done.has(day)) hits++
  }
  return due ? hits / due : null
}

export interface DayMark {
  date: IsoDate
  due: boolean
  done: boolean
}

/** Día local en que se creó: antes de él no tocaba nada. */
export const createdOn = (routine: Pick<Routine, 'createdAt'>): IsoDate => isoOfInstant(routine.createdAt)

/**
 * Los últimos días, del más antiguo a hoy: qué tocaba y qué se hizo. Antes de crearla no tocaba
 * (salvo lo que ya aparezca hecho, que manda).
 */
export function recentDays(routine: Pick<Routine, 'days' | 'done' | 'createdAt'>, today: IsoDate, count = RECENT_DAYS): DayMark[] {
  const done = new Set(routine.done)
  const born = createdOn(routine)
  return Array.from({ length: count }, (_, index) => {
    const date = addDays(today, index - count + 1)
    const hit = done.has(date)
    return { date, due: hit || (date >= born && isDue(routine, date)), done: hit }
  })
}

/**
 * `Cada día`, `Entre semana`, `Fines de semana`, `Los lunes`, `Lun, mié y vie` · `Every day`,
 * `Weekdays`, `Weekends`, `Mondays`, `Mon, Wed and Fri`.
 */
export function daysLabel(days: readonly number[]): string {
  const words = pick(DAYS)
  const clean = cleanDays(days)
  if (sameDays(clean, ALL_DAYS)) return words.every
  if (sameDays(clean, WORKDAYS)) return words.workdays
  if (sameDays(clean, WEEKEND)) return words.weekend
  const [only] = clean
  if (clean.length === 1 && only) return words.only(words.plural[only - 1] ?? '')
  const names = clean.map((day) => words.short[day - 1] ?? '')
  const last = names.pop()
  const text = `${names.join(', ')} ${words.and} ${last}`
  return text.charAt(0).toUpperCase() + text.slice(1)
}

/** Por hora (las que no tienen, al final) y después en el orden en que se crearon. */
export const byRoutineOrder = (a: Routine, b: Routine): number =>
  compareText(a.time ?? '99:99', b.time ?? '99:99') || a.order - b.order || a.createdAt - b.createdAt

/** Las que tocan ese día, en su orden. */
export const routinesOn = (routines: readonly Routine[], date: IsoDate): Routine[] =>
  routines.filter((routine) => isDue(routine, date)).sort(byRoutineOrder)

export interface RoutineProgress {
  done: number
  total: number
}

export function routineProgress(routines: readonly Routine[], date: IsoDate): RoutineProgress {
  const due = routines.filter((routine) => isDue(routine, date))
  return { done: due.filter((routine) => isDoneOn(routine, date)).length, total: due.length }
}

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null

/** Rutina saneada desde datos externos (copia, almacenamiento). */
export function normalizeRoutine(raw: unknown): Routine | null {
  if (!isObject(raw) || typeof raw.id !== 'string' || !raw.id || typeof raw.title !== 'string') return null
  const title = raw.title.replace(/\s+/g, ' ').trim()
  if (!title) return null
  const done = Array.isArray(raw.done)
    ? [...new Set(raw.done.filter((day): day is string => typeof day === 'string' && ISO_DATE.test(day)))].sort().slice(-ROUTINE_LOG_DAYS)
    : []
  return {
    id: raw.id,
    title,
    // Las copias anteriores al emoji no lo traen: quedan sin él.
    emoji: cleanEmoji(raw.emoji),
    days: cleanDays(Array.isArray(raw.days) ? raw.days : []),
    time: isValidTime(raw.time) ? raw.time : null,
    done,
    order: typeof raw.order === 'number' && Number.isFinite(raw.order) ? raw.order : 0,
    createdAt: typeof raw.createdAt === 'number' && Number.isFinite(raw.createdAt) ? raw.createdAt : Date.now(),
  }
}

/** Cuándo empieza el día de las rutinas si nadie lo cambia: a medianoche, como el calendario. */
export const DAY_START: IsoTime = '00:00'
const DAY_MINUTES = 1440
const HALF_DAY = 720

const minutesOf = (time: IsoTime): number => {
  const [hours = 0, minutes = 0] = time.split(':').map(Number)
  return hours * 60 + minutes
}

/**
 * Minutos que el día de las rutinas va detrás del calendario. Con "04:00", lo que se tacha a la 1 de la
 * madrugada cuenta para el día anterior (la racha de quien se acuesta tarde no se rompe). Una hora de
 * la tarde lo adelanta: con "22:00", el día empieza la víspera por la noche (negativo).
 */
export function dayShift(dayStart: IsoTime): number {
  if (!isValidTime(dayStart)) return 0
  const minutes = minutesOf(dayStart)
  return minutes <= HALF_DAY ? minutes : minutes - DAY_MINUTES
}

/** Desplazamiento de un día de calendario a esa hora: −1 (aún es ayer), +1 (ya es mañana) o 0. */
function dayOffset(minutes: number, shift: number): number {
  if (shift > 0 && minutes < shift) return -1
  if (shift < 0 && minutes >= DAY_MINUTES + shift) return 1
  return 0
}

/** El día de las rutinas en un instante: el que se tacha, cuenta para la racha y enseña el widget. */
export function routineDay(now: number, dayStart: IsoTime): IsoDate {
  const date = new Date(now)
  const offset = dayOffset(date.getHours() * 60 + date.getMinutes(), dayShift(dayStart))
  return offset ? addDays(isoOfInstant(now), offset) : isoOfInstant(now)
}

/** Día de calendario en que suena el aviso a `time` de la rutina del día `day` (la 1:00 de un día que empieza a las 4:00 es la madrugada siguiente). */
export function occurrenceDate(day: IsoDate, time: IsoTime, dayStart: IsoTime): IsoDate {
  const offset = dayOffset(minutesOf(time), dayShift(dayStart))
  return offset ? addDays(day, -offset) : day
}

/** Id del aviso de una rutina un día concreto: `routine-<id>-AAAAMMDD`. Estable entre sincronizaciones. */
export const routineEntryId = (routineId: string, date: IsoDate): string => `routine-${routineId}-${date.replace(/-/g, '')}`

/**
 * El atajo de una vez por semana ("Los martes"): el día que ya tiene si es uno solo; si no, el de `day`
 * (hoy, o el de la tarea). Para entrenar cada lunes sin tener que quitar los otros seis días.
 */
export const weeklyPreset = (days: readonly number[], day: IsoDate): number[] => {
  const [only] = days
  return [days.length === 1 && only ? only : isoWeekday(day)]
}
