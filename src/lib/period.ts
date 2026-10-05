import type { IsoDate, Task } from '../types'
import { addDays, dayMonth, dayNameLong, dayNumber, diffDays, isoOfInstant, monthShort, startOfWeek } from './date'
import { pick } from './i18n'

/**
 * Plazo de una tarea: "esta semana", "hasta el viernes", "del lunes al viernes". La tarea vale para
 * cualquier día entre `date` y `until` (los dos incluidos) y, mientras siga pendiente, se ve en hoy:
 * va pasando sola de un día al siguiente sin quedar atrasada, así que no hay que traerla cada mañana.
 * Pasado el último día, sí está atrasada. No es una rutina: se hace una vez.
 */

type Dated = Pick<Task, 'date' | 'until'>

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

/** Una tarea con plazo de verdad: con día y acabando después de él. */
export const hasPeriod = (task: Dated): task is { date: IsoDate; until: IsoDate } =>
  task.date !== null && task.until !== null && task.until > task.date

/** Último día en que vale: el final del plazo o su día. Después de él, la tarea está atrasada. */
export const lastDay = (task: Dated): IsoDate | null => (hasPeriod(task) ? task.until : task.date)

const clamp = (day: IsoDate, from: IsoDate, to: IsoDate): IsoDate => (day < from ? from : day > to ? to : day)

/**
 * Día en que se ve la tarea. Sin plazo, el suyo. Con plazo y pendiente, hoy mientras dure (antes de
 * empezar, su primer día; acabado, el último); hecha, el día en que se hizo.
 */
export function shownDay(task: Pick<Task, 'date' | 'until' | 'done' | 'completedAt'>, today: IsoDate): IsoDate | null {
  if (!hasPeriod(task)) return task.date
  const day = task.done ? (task.completedAt === null ? task.date : isoOfInstant(task.completedAt)) : today
  return clamp(day, task.date, task.until)
}

/** Va con un día que no es el suyo: el plazo la ha ido trayendo. Sale arriba, como lo que se pasa a hoy. */
export const isCarried = (task: Pick<Task, 'date' | 'until' | 'done' | 'completedAt'>, today: IsoDate): boolean =>
  hasPeriod(task) && shownDay(task, today) !== task.date

/** El final del plazo que vale con ese día: `null` si no queda después de él (o no es una fecha). */
export function cleanUntil(date: IsoDate | null, until: unknown): IsoDate | null {
  return date !== null && typeof until === 'string' && ISO_DATE.test(until) && until > date ? until : null
}

/**
 * La tarea como si fuera solo de ese día: cada día del plazo es un día más de la tarea, con su hora
 * y sus avisos. Para los avisos y el horario.
 */
export const onDay = (task: Task, day: IsoDate): Task => ({ ...task, date: day, until: null })

/** Días del plazo en que la tarea se puede ver, desde `from` y como mucho `count`. */
export function periodDays(task: Dated, from: IsoDate, count: number): IsoDate[] {
  if (!hasPeriod(task)) return task.date && task.date >= from ? [task.date] : []
  const first = task.date > from ? task.date : from
  const days: IsoDate[] = []
  for (let day = first; day <= task.until && days.length < count; day = addDays(day, 1)) days.push(day)
  return days
}

// ── Cómo se dice ─────────────────────────────────────────────────────────

const TEXT = {
  es: {
    thisWeek: 'Esta semana',
    nextWeek: 'La semana que viene',
    weekend: 'Este fin de semana',
    thisMonth: 'Este mes',
    untilWeekday: (day: string) => `Hasta el ${day}`,
    untilDate: (day: string) => `Hasta el ${day}`,
    range: (from: IsoDate, to: IsoDate) =>
      monthShort(from) === monthShort(to)
        ? `Del ${dayNumber(from)} al ${dayNumber(to)} ${monthShort(to)}`
        : `Del ${dayMonth(from)} al ${dayMonth(to)}`,
    lastDay: 'Último día',
  },
  en: {
    thisWeek: 'This week',
    nextWeek: 'Next week',
    weekend: 'This weekend',
    thisMonth: 'This month',
    untilWeekday: (day: string) => `Until ${day}`,
    untilDate: (day: string) => `Until ${day}`,
    range: (from: IsoDate, to: IsoDate) =>
      monthShort(from) === monthShort(to) ? `${dayMonth(from)} – ${dayNumber(to)}` : `${dayMonth(from)} – ${dayMonth(to)}`,
    lastDay: 'Last day',
  },
} as const

const endOfWeek = (day: IsoDate): IsoDate => addDays(startOfWeek(day), 6)

/** Último día del mes de `day`. */
export function endOfMonth(day: IsoDate): IsoDate {
  const [year = 0, month = 1] = day.split('-').map(Number)
  return addDays(`${year + Math.floor(month / 12)}-${String((month % 12) + 1).padStart(2, '0')}-01`, -1)
}

/** `el viernes` dentro de la semana que viene; si no, `el 15 oct` · `Friday`, `Oct 15`. */
export function untilLabel(until: IsoDate, today: IsoDate): string {
  const text = pick(TEXT)
  const near = diffDays(today, until) <= 6
  return near ? text.untilWeekday(dayNameLong(until)) : text.untilDate(dayMonth(until))
}

/**
 * Cómo se dice un plazo entero: `Esta semana`, `La semana que viene`, `Este fin de semana`, `Este mes`,
 * `Hasta el viernes`, `Del 6 al 10 oct` · `This week`, `Next week`, `Until Friday`, `Oct 6 – 10`.
 */
export function periodLabel(date: IsoDate, until: IsoDate, today: IsoDate): string {
  const text = pick(TEXT)
  const monday = startOfWeek(today)
  if (date <= today) {
    if (until === endOfWeek(today)) return text.thisWeek
    if (until === endOfMonth(today) && diffDays(today, until) > 6) return text.thisMonth
    return untilLabel(until, today)
  }
  if (date === addDays(monday, 7) && until === addDays(monday, 13)) return text.nextWeek
  if (date === addDays(monday, 5) && until === addDays(monday, 6)) return text.weekend
  return text.range(date, until)
}

/**
 * Lo que dice la fila de una tarea con plazo pendiente: `Hasta el viernes`, o `Último día` el día en
 * que acaba. `null` sin plazo, hecha o ya atrasada (eso lo dice su bloque).
 */
export function periodTag(task: Pick<Task, 'date' | 'until' | 'done' | 'completedAt'>, today: IsoDate): { label: string; last: boolean } | null {
  if (task.done || !hasPeriod(task) || task.until < today) return null
  if (shownDay(task, today) === task.until) return { label: pick(TEXT).lastDay, last: true }
  return { label: untilLabel(task.until, today), last: false }
}

// ── Plazos dichos ────────────────────────────────────────────────────────

/**
 * Un plazo reconocido en lo escrito o dictado: del primer día al último. `until`: "hasta el viernes",
 * un límite (con hora, es la de ese último día). `range`: "del lunes al viernes". `loose`: "esta
 * semana", "este mes"; con un día dicho ("el viernes de esta semana") solo dice cuál, no es un plazo.
 */
export interface DayRange {
  start: IsoDate
  end: IsoDate
  kind: 'until' | 'range' | 'loose'
}

/** "Esta semana": de hoy al domingo. */
export const thisWeek = (today: IsoDate): DayRange => ({ start: today, end: endOfWeek(today), kind: 'loose' })

/** "La semana que viene": de su lunes a su domingo. */
export function nextWeek(today: IsoDate): DayRange {
  const monday = addDays(startOfWeek(today), 7)
  return { start: monday, end: addDays(monday, 6), kind: 'loose' }
}

/** "Este mes": de hoy a su último día. */
export const thisMonth = (today: IsoDate): DayRange => ({ start: today, end: endOfMonth(today), kind: 'loose' })

/** Lo más largo que puede durar un "del 28 al 3": más sería leer mal el mes. */
export const MAX_RANGE_DAYS = 62

/** "Del 5 al 9", "del lunes al viernes": un plazo entre dos días dichos, si no es absurdamente largo. */
export const between = (start: IsoDate | null, end: IsoDate | null): DayRange | null =>
  start && end && end >= start && diffDays(start, end) <= MAX_RANGE_DAYS ? { start, end, kind: 'range' } : null

/**
 * "Este fin de semana": sábado y domingo (si ya es fin de semana, desde hoy). `skip`: el siguiente
 * ("el próximo fin de semana" dicho un sábado, "next weekend").
 */
export function weekendOf(today: IsoDate, skip: boolean): DayRange {
  const saturday = addDays(startOfWeek(today), skip ? 12 : 5)
  return { start: saturday > today ? saturday : today, end: addDays(saturday, 1), kind: 'loose' }
}

/** `true` en sábado o domingo. */
export const isWeekend = (day: IsoDate): boolean => diffDays(startOfWeek(day), day) >= 5

/** El primer día desde `from` (incluido) que cae en ese día de la semana (0 = domingo). */
export const onOrAfter = (from: IsoDate, weekday: number): IsoDate => {
  const current = (diffDays(startOfWeek(from), from) + 1) % 7
  return addDays(from, (weekday - current + 7) % 7)
}

/** El primer día con ese número desde `from` (incluido); con `month` (1–12), además de ese mes. */
export function dayOnOrAfter(from: IsoDate, day: number, month?: number): IsoDate | null {
  if (!Number.isInteger(day) || day < 1 || day > 31) return null
  const [year = 0, start = 1] = from.split('-').map(Number)
  for (let ahead = 0; ahead < 14; ahead++) {
    const date = new Date(year, start - 1 + ahead, day)
    if (date.getDate() !== day || (month !== undefined && date.getMonth() !== month - 1)) continue
    const iso = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    if (iso >= from) return iso
  }
  return null
}

/** La tarea tal como cuenta hoy: con plazo y pendiente, como si fuera de hoy (su hora y sus avisos). */
export const asOf = (task: Task, today: IsoDate): Task =>
  hasPeriod(task) && !task.done ? onDay(task, shownDay(task, today) ?? today) : task
