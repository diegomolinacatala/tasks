import type { AppState, Reminder, ReminderDraft, Task } from '../types'
import { addDays, isoOfInstant, relativeLabel, shortTime, timeOfInstant, toInstant } from './date'

export const MAX_REMINDERS = 20
/** Tope de avisos que se suben al servidor de una vez. */
export const MAX_SCHEDULE = 200
/** `before` admite hasta 30 días de antelación. */
export const MAX_BEFORE_MINUTES = 30 * 24 * 60

const MINUTE = 60_000
const HOUR_MIN = 60
const DAY_MIN = 24 * HOUR_MIN
const MORNING = '09:00'
const EVENING = '18:00'

/** Instante de la tarea: solo existe con fecha y hora. */
export function taskInstant(task: Task): number | null {
  return task.date && task.time ? toInstant(task.date, task.time) : null
}

/** Cuándo suena un recordatorio. `null` = inactivo (un `before` sin fecha u hora). */
export function resolveAt(task: Task, reminder: ReminderDraft): number | null {
  if (reminder.kind === 'at') return reminder.at
  const base = taskInstant(task)
  return base === null ? null : base - reminder.minutes * MINUTE
}

export function sameReminder(a: ReminderDraft, b: ReminderDraft): boolean {
  if (a.kind === 'at') return b.kind === 'at' && a.at === b.at
  return b.kind === 'before' && a.minutes === b.minutes
}

export const isPending = (task: Task, reminder: ReminderDraft, now: number): boolean => {
  if (task.done) return false
  const at = resolveAt(task, reminder)
  return at !== null && at > now
}

/** Próximo aviso pendiente de la tarea. */
export function nextReminderAt(task: Task, now: number): number | null {
  if (task.done) return null
  return task.reminders.reduce<number | null>((next, reminder) => {
    const at = resolveAt(task, reminder)
    if (at === null || at <= now) return next
    return next === null || at < next ? at : next
  }, null)
}

/** Añade un recordatorio salvo que ya exista uno equivalente o se haya llegado al tope. */
export function withReminder(task: Task, draft: ReminderDraft, id: string): Task {
  if (task.reminders.length >= MAX_REMINDERS) return task
  if (task.reminders.some((reminder) => sameReminder(reminder, draft))) return task
  return { ...task, reminders: [...task.reminders, { ...draft, id }] }
}

/** Posponer: descarta los `at` que ya sonaron y programa uno nuevo. */
export function snoozed(task: Task, at: number, now: number, id: string): Task {
  const kept = task.reminders.filter((reminder) => reminder.kind !== 'at' || reminder.at > now)
  return withReminder({ ...task, reminders: kept }, { kind: 'at', at }, id)
}

export interface ScheduleEntry {
  /** Id del recordatorio: único y estable entre sincronizaciones. */
  id: string
  taskId: string
  at: number
  title: string
  body: string
  /** Lo que marcará el icono cuando llegue el aviso. */
  badge: number
}

/** Pendientes con fecha hasta el día indicado: hoy más lo atrasado. */
export function badgeCount(tasks: readonly Task[], at: number): number {
  const day = isoOfInstant(at)
  return tasks.filter((task) => !task.done && task.date !== null && task.date <= day).length
}

function bodyFor(task: Task, at: number): string {
  if (!task.date || !task.time) return ''
  return `${relativeLabel(task.date, isoOfInstant(at))} ${shortTime(task.time)}`
}

/** Avisos futuros de todas las tareas pendientes, del más cercano al más lejano. */
export function upcomingSchedule(state: AppState, now: number, max = MAX_SCHEDULE): ScheduleEntry[] {
  const entries = state.tasks.flatMap((task) =>
    task.done
      ? []
      : task.reminders.flatMap((reminder) => {
          const at = resolveAt(task, reminder)
          if (at === null || at <= now) return []
          return [{ id: reminder.id, taskId: task.id, at, title: task.title, body: bodyFor(task, at), badge: 0 }]
        }),
  )
  return entries
    .sort((a, b) => a.at - b.at)
    .slice(0, max)
    .map((entry) => ({ ...entry, badge: badgeCount(state.tasks, entry.at) }))
}

function beforeLabel(minutes: number): string {
  if (minutes === 0) return 'A la hora'
  if (minutes % DAY_MIN === 0) {
    const days = minutes / DAY_MIN
    return days === 1 ? '1 día antes' : `${days} días antes`
  }
  if (minutes % HOUR_MIN === 0) return `${minutes / HOUR_MIN} h antes`
  return `${minutes} min antes`
}

/** `Hoy 18:00`, `Mañana 9:00`, `15 min antes`. */
export function reminderLabel(reminder: ReminderDraft, now: number): string {
  if (reminder.kind === 'before') return beforeLabel(reminder.minutes)
  return `${relativeLabel(isoOfInstant(reminder.at), isoOfInstant(now))} ${shortTime(timeOfInstant(reminder.at))}`
}

export interface Preset {
  key: string
  label: string
  draft: ReminderDraft
}

const at = (key: string, label: string, instant: number): Preset => ({ key, label, draft: { kind: 'at', at: instant } })
const before = (key: string, minutes: number): Preset => ({
  key,
  label: beforeLabel(minutes),
  draft: { kind: 'before', minutes },
})

/** Redondea hacia arriba al minuto: los avisos no llevan segundos. */
const ceilMinute = (ms: number) => Math.ceil(ms / MINUTE) * MINUTE

/** Atajos de un toque. Solo los que caen en el futuro y no están ya puestos. */
export function reminderPresets(task: Task, now: number): Preset[] {
  const today = isoOfInstant(now)
  const tomorrow = addDays(today, 1)
  const candidates: Preset[] = []

  if (taskInstant(task) !== null) {
    candidates.push(before('on-time', 0), before('before-15', 15), before('before-60', 60), before('before-1d', DAY_MIN))
  }
  candidates.push(at('in-1h', 'En 1 h', ceilMinute(now + HOUR_MIN * MINUTE)))
  candidates.push(at('evening', `Hoy ${EVENING}`, toInstant(today, EVENING)))
  candidates.push(at('tomorrow', `Mañana ${shortTime(MORNING)}`, toInstant(tomorrow, MORNING)))
  if (task.date && task.date > tomorrow) {
    candidates.push(at('day-of', `${relativeLabel(task.date, today)} ${shortTime(MORNING)}`, toInstant(task.date, MORNING)))
  }

  return candidates.filter(
    (preset) =>
      isPending({ ...task, done: false }, preset.draft, now) &&
      !task.reminders.some((reminder) => sameReminder(reminder, preset.draft)),
  )
}

export interface SnoozeOption {
  key: string
  label: string
  at: number
}

export function snoozeOptions(now: number): SnoozeOption[] {
  const tomorrow = addDays(isoOfInstant(now), 1)
  return [
    { key: '10m', label: '+10 min', at: ceilMinute(now + 10 * MINUTE) },
    { key: '1h', label: '+1 h', at: ceilMinute(now + HOUR_MIN * MINUTE) },
    { key: 'tomorrow', label: `Mañana ${shortTime(MORNING)}`, at: toInstant(tomorrow, MORNING) },
  ]
}

/** Recordatorio saneado desde datos externos (backup, almacenamiento). */
export function normalizeReminder(raw: unknown): Reminder | null {
  if (typeof raw !== 'object' || raw === null) return null
  const value = raw as Record<string, unknown>
  if (typeof value.id !== 'string' || !value.id) return null
  if (value.kind === 'at' && typeof value.at === 'number' && Number.isFinite(value.at) && value.at > 0) {
    return { id: value.id, kind: 'at', at: Math.round(value.at) }
  }
  if (
    value.kind === 'before' &&
    typeof value.minutes === 'number' &&
    Number.isInteger(value.minutes) &&
    value.minutes >= 0 &&
    value.minutes <= MAX_BEFORE_MINUTES
  ) {
    return { id: value.id, kind: 'before', minutes: value.minutes }
  }
  return null
}
