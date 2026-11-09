import type { HerePoint, Place, Reminder, ReminderDraft, Task } from '../types'
import { addDays, isoOfInstant, relativeLabel, shortTime, timeOfInstant, toInstant } from './date'
import { language, pick } from './i18n'
import { hereAlive, placeReminderLabel } from './places'

export const MAX_REMINDERS = 20
/**
 * Radios que se ofrecen para "al alejarme". iOS vigila las regiones con posicionamiento de baja
 * potencia: por debajo de unos 100 m avisa tarde o no avisa, así que 25 m es el suelo (el usuario pidió
 * radios pequeños) y la región que se registra crece con el error del GPS (`placeAlerts`).
 */
export const HERE_RADII: readonly number[] = [25, 50, 100, 200, 500]
export const DEFAULT_HERE_RADIUS = 100
export const MIN_HERE_RADIUS = 25
export const MAX_HERE_RADIUS = 1000
/** Siri con la app cerrada no sabe dónde estás: el punto se fija al abrir la app, pero solo si es enseguida. */
export const HERE_PIN_WINDOW_MS = 15 * 60_000

export const clampHereRadius = (radius: number): number => Math.min(MAX_HERE_RADIUS, Math.max(MIN_HERE_RADIUS, Math.round(radius)))

/** Un punto saneado desde datos externos; `null` si no es un punto. */
export function normalizeHerePoint(raw: unknown): HerePoint | null {
  if (typeof raw !== 'object' || raw === null) return null
  const { lat, lng, accuracy } = raw as Record<string, unknown>
  if (typeof lat !== 'number' || typeof lng !== 'number' || !Number.isFinite(lat) || !Number.isFinite(lng)) return null
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null
  return typeof accuracy === 'number' && Number.isFinite(accuracy) && accuracy >= 0 ? { lat, lng, accuracy: Math.round(accuracy) } : { lat, lng }
}

/** `Al alejarme 50 m` · `Once I’m 50 m away`. */
export const hereLabel = (radius: number): string => (language() === 'en' ? `Once I’m ${radius} m away` : `Al alejarme ${radius} m`)
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

/** Cuándo suena un recordatorio. `null` = sin instante (un `before` sin fecha u hora, o un lugar). */
export function resolveAt(task: Task, reminder: ReminderDraft): number | null {
  if (reminder.kind === 'at') return reminder.at
  if (reminder.kind === 'place' || reminder.kind === 'here') return null
  const base = taskInstant(task)
  return base === null ? null : base - reminder.minutes * MINUTE
}

/** Una tarea solo lleva un "al alejarme": da igual el radio. */
export function sameReminder(a: ReminderDraft, b: ReminderDraft): boolean {
  if (a.kind === 'at') return b.kind === 'at' && a.at === b.at
  if (a.kind === 'place') return b.kind === 'place' && a.placeId === b.placeId && a.on === b.on
  if (a.kind === 'here') return b.kind === 'here'
  return b.kind === 'before' && a.minutes === b.minutes
}

export const isPending = (task: Task, reminder: ReminderDraft, now: number): boolean => {
  if (task.done) return false
  if (reminder.kind === 'place' || reminder.kind === 'here') return true
  const at = resolveAt(task, reminder)
  return at !== null && at > now
}

/** Próximo aviso pendiente de la tarea. */
export type ReminderIssue = 'no-time' | 'past' | 'no-place' | 'phone-only'

/**
 * Por qué un aviso no va a sonar, para decirlo junto a él: un "antes" sin fecha u hora, uno que ya
 * pasó, un lugar sin ubicar o un aviso de lugar fuera del iPhone (la web no puede). `null` si suena.
 */
export function reminderIssue(
  task: Task,
  reminder: ReminderDraft,
  now: number,
  places: readonly Place[],
  native: boolean,
): ReminderIssue | null {
  if (reminder.kind === 'place') {
    if (!native) return 'phone-only'
    return places.find((place) => place.id === reminder.placeId)?.location ? null : 'no-place'
  }
  if (reminder.kind === 'here') {
    if (!native) return 'phone-only'
    if (!reminder.from) return 'no-place'
    return hereAlive(reminder.since, now) ? null : 'past'
  }
  if (reminder.kind === 'before' && taskInstant(task) === null) return 'no-time'
  const at = resolveAt(task, reminder)
  return at !== null && at > now ? null : 'past'
}

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

/** `A la hora`, `15 min antes`, `1 h antes`, `1 día antes` · `On time`, `15 min before`, `1 hr before`, `1 day before`. */
function beforeLabel(minutes: number): string {
  const en = language() === 'en'
  if (minutes === 0) return en ? 'On time' : 'A la hora'
  if (minutes % DAY_MIN === 0) {
    const days = minutes / DAY_MIN
    if (en) return days === 1 ? '1 day before' : `${days} days before`
    return days === 1 ? '1 día antes' : `${days} días antes`
  }
  if (minutes % HOUR_MIN === 0) return en ? `${minutes / HOUR_MIN} hr before` : `${minutes / HOUR_MIN} h antes`
  return en ? `${minutes} min before` : `${minutes} min antes`
}

const WORDS = {
  es: { inHour: 'En 1 h', today: 'Hoy', tomorrow: 'Mañana', hour: '+1 h' },
  en: { inHour: 'In 1 hr', today: 'Today', tomorrow: 'Tomorrow', hour: '+1 hr' },
} as const

/** `Hoy 18:00`, `Mañana 9:00`, `15 min antes`, `Al llegar a Mercadona`. */
export function reminderLabel(reminder: ReminderDraft, now: number, places: readonly Place[] = []): string {
  if (reminder.kind === 'before') return beforeLabel(reminder.minutes)
  if (reminder.kind === 'place') return placeReminderLabel(reminder, places)
  if (reminder.kind === 'here') return hereLabel(reminder.radius)
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
  const words = pick(WORDS)
  candidates.push(at('in-1h', words.inHour, ceilMinute(now + HOUR_MIN * MINUTE)))
  candidates.push(at('evening', `${words.today} ${shortTime(EVENING)}`, toInstant(today, EVENING)))
  candidates.push(at('tomorrow', `${words.tomorrow} ${shortTime(MORNING)}`, toInstant(tomorrow, MORNING)))
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
  const words = pick(WORDS)
  return [
    { key: '10m', label: '+10 min', at: ceilMinute(now + 10 * MINUTE) },
    { key: '1h', label: words.hour, at: ceilMinute(now + HOUR_MIN * MINUTE) },
    { key: 'tomorrow', label: `${words.tomorrow} ${shortTime(MORNING)}`, at: toInstant(tomorrow, MORNING) },
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
  if (value.kind === 'place' && typeof value.placeId === 'string' && value.placeId && (value.on === 'arrive' || value.on === 'leave')) {
    return { id: value.id, kind: 'place', placeId: value.placeId, on: value.on }
  }
  if (value.kind === 'here' && typeof value.radius === 'number' && Number.isFinite(value.radius)) {
    const since = typeof value.since === 'number' && Number.isFinite(value.since) && value.since > 0 ? Math.round(value.since) : 0
    return { id: value.id, kind: 'here', radius: clampHereRadius(value.radius), from: normalizeHerePoint(value.from), since }
  }
  return null
}
