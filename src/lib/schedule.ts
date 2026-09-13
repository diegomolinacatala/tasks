import type { AppState, IsoDate, Reminder, Section, Task } from '../types'
import { addDays, dayNumber, isoOfInstant, monthShort, relativeLabel, shortTime, toInstant } from './date'
import { byOrder } from './order'
import { MAX_SCHEDULE, resolveAt, taskInstant } from './reminders'

const MINUTE = 60_000
const SOON_MINUTES = 60
/** Días por delante para los que se programa el resumen diario. */
export const DIGEST_DAYS = 7
const DIGEST_PREVIEW = 3

export interface ScheduleEntry {
  /** Id del recordatorio o `digest-AAAAMMDD`: único y estable entre sincronizaciones. */
  id: string
  /** `null` = no abre ninguna tarea concreta (resumen diario). */
  taskId: string | null
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

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`

function sinceLabel(date: IsoDate, day: IsoDate): string {
  if (date === addDays(day, -1)) return 'Pendiente desde ayer'
  return `Pendiente desde el ${dayNumber(date)} ${monthShort(date)}`
}

/** Cuándo toca la tarea, visto desde el momento en que suena el aviso. */
function whenText(task: Task, at: number): string {
  const day = isoOfInstant(at)
  const instant = taskInstant(task)
  if (instant !== null && task.date && task.time) {
    const clock = shortTime(task.time)
    const minutes = Math.round((instant - at) / MINUTE)
    if (minutes === 0) return `Ahora · ${clock}`
    if (minutes < 0) return task.date === day ? `Era a las ${clock}` : sinceLabel(task.date, day)
    if (task.date === day) return minutes < SOON_MINUTES ? `En ${minutes} min · ${clock}` : `Hoy a las ${clock}`
    return `${relativeLabel(task.date, day)} a las ${clock}`
  }
  if (!task.date) return 'Sin fecha'
  if (task.date === day) return 'Para hoy'
  if (task.date < day) return sinceLabel(task.date, day)
  return `Para ${relativeLabel(task.date, day).toLowerCase()}`
}

export function notificationBody(task: Task, at: number, sections: readonly Section[]): string {
  const section = task.sectionId ? sections.find((item) => item.id === task.sectionId) : undefined
  return [whenText(task, at), section?.name].filter(Boolean).join(' · ')
}

function reminderEntries(state: AppState, now: number): Omit<ScheduleEntry, 'badge'>[] {
  return state.tasks.flatMap((task) =>
    task.done
      ? []
      : task.reminders.flatMap((reminder: Reminder) => {
          const at = resolveAt(task, reminder)
          if (at === null || at <= now) return []
          return [{ id: reminder.id, taskId: task.id, at, title: task.title, body: notificationBody(task, at, state.sections) }]
        }),
  )
}

/** Lo del día primero por hora y luego por el orden de la lista. */
const byTimeThenOrder = (a: Task, b: Task) => (a.time ?? '99:99').localeCompare(b.time ?? '99:99') || byOrder(a, b)

/** Un aviso por día con lo que hay para ese día, si el usuario lo ha activado. */
export function digestEntries(state: AppState, now: number): Omit<ScheduleEntry, 'badge'>[] {
  const { enabled, time } = state.settings.digest
  if (!enabled) return []
  const today = isoOfInstant(now)

  return Array.from({ length: DIGEST_DAYS }, (_, offset) => addDays(today, offset)).flatMap((day) => {
    const at = toInstant(day, time)
    if (at <= now) return []
    const due = state.tasks.filter((task) => !task.done && task.date === day).sort(byTimeThenOrder)
    const overdue = state.tasks.filter((task) => !task.done && task.date !== null && task.date < day).length
    if (!due.length && !overdue) return []

    const title = [
      due.length ? `${plural(due.length, 'tarea', 'tareas')} para hoy` : 'Nada nuevo para hoy',
      overdue ? plural(overdue, 'atrasada', 'atrasadas') : '',
    ]
      .filter(Boolean)
      .join(' · ')
    const preview = due.slice(0, DIGEST_PREVIEW).map((task) => (task.time ? `${shortTime(task.time)} ${task.title}` : task.title))
    const rest = due.length - preview.length
    const body = [...preview, rest > 0 ? `+${rest}` : ''].filter(Boolean).join(' · ')

    return [{ id: `digest-${day.replace(/-/g, '')}`, taskId: null, at, title, body }]
  })
}

/** Todo lo que debe sonar a partir de ahora, del más cercano al más lejano. */
export function upcomingSchedule(state: AppState, now: number, max = MAX_SCHEDULE): ScheduleEntry[] {
  return [...digestEntries(state, now), ...reminderEntries(state, now)]
    .sort((a, b) => a.at - b.at)
    .slice(0, max)
    .map((entry) => ({ ...entry, badge: badgeCount(state.tasks, entry.at) }))
}
