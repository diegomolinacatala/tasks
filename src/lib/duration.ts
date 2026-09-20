import type { IsoTime, Task } from '../types'
import { formatTime, shortTime } from './date'
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
/** Atajos del panel; la duración exacta se pone eligiendo a qué hora acaba. */
export const DURATION_PRESETS = [15, 30, HOUR_MIN, 2 * HOUR_MIN] as const

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

const minutesOf = (value: IsoTime) => {
  const [hours = 0, mins = 0] = value.split(':').map(Number)
  return hours * HOUR_MIN + mins
}

/** Hora del reloj a la que acaba (`18:30`), dando la vuelta a medianoche. */
export function endClock(time: IsoTime, duration: number): IsoTime {
  const total = (minutesOf(time) + duration) % DAY_MIN
  return formatTime(Math.floor(total / HOUR_MIN), total % HOUR_MIN)
}

/** `30 min`, `1 h`, `1 h 30`, `2 h`. */
export function durationLabel(minutes: number): string {
  if (minutes < HOUR_MIN) return `${minutes} min`
  const hours = Math.floor(minutes / HOUR_MIN)
  const rest = minutes % HOUR_MIN
  return rest === 0 ? `${hours} h` : `${hours} h ${rest}`
}

/** `17:30–18:30`, o solo la hora si no dura nada. */
export function spanLabel(time: IsoTime, duration: number | null): string {
  return duration === null ? shortTime(time) : `${shortTime(time)}–${shortTime(endClock(time, duration))}`
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
 * (el aviso lleva un rato en la pantalla) no deje la siguiente pregunta en el pasado.
 */
export function extendedDuration(task: Task, now: number, minutes = AGAIN_MINUTES): number | null {
  const start = taskInstant(task)
  if (start === null || task.duration === null) return null
  const elapsed = Math.round((now - start) / MINUTE)
  const next = clampDuration(Math.max(task.duration, elapsed) + minutes)
  return next === task.duration ? null : next
}
