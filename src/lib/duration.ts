import type { IsoTime, Task } from '../types'
import { formatTime, isoOfInstant, shortTime } from './date'
import { language } from './i18n'
import { asOf } from './period'
import { taskInstant } from './reminders'

/**
 * Cuánto dura una tarea y, con eso, cuándo se le pregunta si ha acabado. `Task.duration` son
 * minutos y solo tiene efecto con fecha y hora, igual que la hora solo la tiene con fecha.
 * El aviso de cierre no se guarda: sale de la duración (`checkInEntries` en `schedule.ts`).
 */

const MINUTE = 60_000
const HOUR_MIN = 60

export const MIN_DURATION = 5
/** Más de medio día deja de ser un rato acotado: preguntar "¿has acabado?" ya no dice nada. */
export const MAX_DURATION = 12 * HOUR_MIN
/** Lo que se retrasa la pregunta al responder "Todavía no". */
export const AGAIN_MINUTES = 15

export function clampDuration(minutes: number): number {
  return Math.min(Math.max(Math.round(minutes), MIN_DURATION), MAX_DURATION)
}

/** Duración saneada desde datos externos (copia, bandeja, IA). Lo que no es un rato, no dura. */
export function normalizeDuration(raw: unknown): number | null {
  if (typeof raw !== 'number' || !Number.isFinite(raw) || raw <= 0) return null
  return clampDuration(raw)
}

/**
 * Instante en que acaba la tarea, que es cuando se pregunta si está hecha. `null` si no tiene
 * fecha, hora o duración. Para programar el aviso se cuenta sobre el instante, no sobre el reloj.
 */
export function taskEnd(task: Task): number | null {
  const start = taskInstant(task)
  return start === null || task.duration === null ? null : start + task.duration * MINUTE
}

const DAY_MIN = 24 * HOUR_MIN

/** Minutos desde medianoche: `17:30` → 1050. */
export const minutesOf = (value: IsoTime): number => {
  const [hours = 0, mins = 0] = value.split(':').map(Number)
  return hours * HOUR_MIN + mins
}

/** Hora del reloj a la que acaba (`18:30`), dando la vuelta a medianoche. */
export function endClock(time: IsoTime, duration: number): IsoTime {
  const total = (minutesOf(time) + duration) % DAY_MIN
  return formatTime(Math.floor(total / HOUR_MIN), total % HOUR_MIN)
}

/** `30 min`, `1 h`, `1 h 30`, `2 h` · `30 min`, `1h`, `1h 30m`, `2h`. */
export function durationLabel(minutes: number): string {
  if (minutes < HOUR_MIN) return `${minutes} min`
  const hours = Math.floor(minutes / HOUR_MIN)
  const rest = minutes % HOUR_MIN
  if (language() === 'en') return rest === 0 ? `${hours}h` : `${hours}h ${rest}m`
  return rest === 0 ? `${hours} h` : `${hours} h ${rest}`
}

/**
 * `17:30–18:30`, o solo la hora si no dura nada. En inglés, `5:30–6:30 PM`: la marca de la tarde
 * va una vez si las dos horas la comparten (`11:30 AM–1:00 PM` si no).
 */
export function spanLabel(time: IsoTime, duration: number | null): string {
  if (duration === null) return shortTime(time)
  const start = shortTime(time)
  const end = shortTime(endClock(time, duration))
  if (language() !== 'en') return `${start}–${end}`
  const startMark = start.slice(-2)
  return startMark === end.slice(-2) ? `${start.slice(0, -3)}–${end}` : `${start}–${end}`
}

/** `17:30–18:30`. `null` si la tarea no tiene día y hora. */
export function timeRange(task: Task): string | null {
  return task.date && task.time ? spanLabel(task.time, task.duration) : null
}

/** Minutos de `time` a `end`; si `end` no es mayor, se entiende del día siguiente ("23:00 a 0:30"). */
export function durationFromEnd(time: IsoTime, end: IsoTime): number {
  const diff = minutesOf(end) - minutesOf(time)
  return clampDuration(diff > 0 ? diff : diff + DAY_MIN)
}

/**
 * "Todavía no": la tarea se alarga hasta `minutes` después de ahora, así que la pregunta vuelve
 * dentro de ese rato. Se cuenta desde ahora y no desde el final previsto para que responder tarde
 * (el aviso lleva un rato en la pantalla) no deje la siguiente pregunta en el pasado. Con plazo, el
 * rato empieza a su hora del día en que está, no del primero.
 */
export function extendedDuration(task: Task, now: number, minutes = AGAIN_MINUTES): number | null {
  const start = taskInstant(asOf(task, isoOfInstant(now)))
  if (start === null || task.duration === null) return null
  const elapsed = Math.round((now - start) / MINUTE)
  const next = clampDuration(Math.max(task.duration, elapsed) + minutes)
  return next === task.duration ? null : next
}
