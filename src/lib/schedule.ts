import type { AppState, IsoDate, Reminder, Section, Task } from '../types'
import { addDays, dayMonth, isoOfInstant, nearLabel, relativeLabel, shortTime, toInstant } from './date'
import { taskEnd, timeRange } from './duration'
import { pick, plural } from './i18n'
import { byImportance } from './importance'
import { byOrder, compareText } from './order'
import { hasPeriod, lastDay, onDay, periodDays, periodTag, shownDay } from './period'
import { MAX_SCHEDULE, resolveAt, taskInstant } from './reminders'
import { daysLabel, isDoneOn, isDue, occurrenceDate, routineDay, routineEntryId } from './routines'

const MINUTE = 60_000
const SOON_MINUTES = 60
/** Días por delante para los que se programa el resumen diario. */
export const DIGEST_DAYS = 7
const DIGEST_PREVIEW = 3
/** Prefijo del id del aviso de cierre. Los ids de recordatorio son base36: nunca chocan. */
const CHECK_IN_PREFIX = 'ask-'

/** Lo que dicen los avisos, en los dos idiomas. */
const TEXT = {
  es: {
    question: '¿Has acabado?',
    sinceYesterday: 'Pendiente desde ayer',
    since: (day: string) => `Pendiente desde el ${day}`,
    now: (clock: string) => `Ahora · ${clock}`,
    was: (clock: string) => `Era a las ${clock}`,
    inMinutes: (minutes: number, clock: string) => `En ${minutes} min · ${clock}`,
    todayAt: (clock: string) => `Hoy a las ${clock}`,
    dayAt: (day: string, clock: string) => `${day} a las ${clock}`,
    noDate: 'Sin fecha',
    dueToday: 'Para hoy',
    due: (day: string, near: boolean) => `Para ${near ? day.toLowerCase() : day}`,
    tasksToday: (count: number) => `${plural(count, 'tarea', 'tareas')} para hoy`,
    nothingToday: 'Nada nuevo para hoy',
    overdue: (count: number) => plural(count, 'atrasada', 'atrasadas'),
  },
  en: {
    question: 'Finished?',
    sinceYesterday: 'Pending since yesterday',
    since: (day: string) => `Pending since ${day}`,
    now: (clock: string) => `Now · ${clock}`,
    was: (clock: string) => `Was at ${clock}`,
    inMinutes: (minutes: number, clock: string) => `In ${minutes} min · ${clock}`,
    todayAt: (clock: string) => `Today at ${clock}`,
    dayAt: (day: string, clock: string) => `${day} at ${clock}`,
    noDate: 'No date',
    dueToday: 'Due today',
    due: (day: string, near: boolean) => `Due ${near ? day.toLowerCase() : day}`,
    tasksToday: (count: number) => `${plural(count, 'task', 'tasks')} today`,
    nothingToday: 'Nothing new today',
    overdue: (count: number) => `${count} overdue`,
  },
} as const

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
  /**
   * Al sonar habrá algo atrasado que se puede pasar a hoy desde el propio aviso: la tarea (si es
   * de un día anterior) o, en el resumen diario, todo lo atrasado.
   */
  overdue: boolean
  /** Aviso de cierre: pregunta si la tarea ya está hecha, con "Sí" y "Todavía no". */
  ask?: true
  /** Aviso de una rutina el día que toca: "Hecha" la tacha para ese día. */
  routine?: { id: string; date: IsoDate }
}

/** Días por delante para los que se programan los avisos de las rutinas. */
export const ROUTINE_DAYS = 7
/** Ídem para los avisos con hora de una tarea con plazo: uno cada día que quede, mientras no se haga. */
export const PERIOD_DAYS = 7

/** Pendientes con fecha hasta el día indicado: hoy más lo atrasado. */
export function badgeCount(tasks: readonly Task[], at: number): number {
  const day = isoOfInstant(at)
  return tasks.filter((task) => !task.done && task.date !== null && task.date <= day).length
}

function sinceLabel(date: IsoDate, day: IsoDate): string {
  const text = pick(TEXT)
  return date === addDays(day, -1) ? text.sinceYesterday : text.since(dayMonth(date))
}

/** Cuándo toca la tarea, visto desde el momento en que suena el aviso. */
function whenText(task: Task, at: number): string {
  const text = pick(TEXT)
  const day = isoOfInstant(at)
  // Con plazo, cada día de él es un día más de la tarea; sin hora, lo que importa es hasta cuándo.
  if (hasPeriod(task)) {
    const tag = task.time ? null : periodTag(task, day)
    if (tag && day >= task.date) return tag.label
    return whenText(onDay(task, shownDay({ ...task, done: false }, day) ?? task.date), at)
  }
  const instant = taskInstant(task)
  if (instant !== null && task.date && task.time) {
    const clock = shortTime(task.time)
    const minutes = Math.round((instant - at) / MINUTE)
    if (minutes === 0) return text.now(clock)
    if (minutes < 0) return task.date === day ? text.was(clock) : sinceLabel(task.date, day)
    if (task.date === day) return minutes < SOON_MINUTES ? text.inMinutes(minutes, clock) : text.todayAt(clock)
    return text.dayAt(relativeLabel(task.date, day), clock)
  }
  if (!task.date) return text.noDate
  if (task.date === day) return text.dueToday
  if (task.date < day) return sinceLabel(task.date, day)
  return text.due(relativeLabel(task.date, day), nearLabel(task.date, day) !== null)
}

export function notificationBody(task: Task, at: number, sections: readonly Section[]): string {
  const section = task.sectionId ? sections.find((item) => item.id === task.sectionId) : undefined
  return [whenText(task, at), section?.name].filter(Boolean).join(' · ')
}

function reminderEntries(state: AppState, now: number): Omit<ScheduleEntry, 'badge'>[] {
  const today = isoOfInstant(now)
  const entry = (task: Task, reminder: Reminder, id: string, last: IsoDate | null): Omit<ScheduleEntry, 'badge'>[] => {
    const at = resolveAt(task, reminder)
    if (at === null || at <= now) return []
    const overdue = last !== null && last < isoOfInstant(at)
    return [{ id, taskId: task.id, at, title: task.title, body: notificationBody(task, at, state.sections), overdue }]
  }
  return state.tasks.flatMap((task) => {
    if (task.done) return []
    const last = lastDay(task)
    return task.reminders.flatMap((reminder: Reminder) => {
      // Con plazo, el aviso "a la hora" (o antes) vale para cada día que quede: suena cada día hasta que se haga.
      if (reminder.kind !== 'before' || !hasPeriod(task)) return entry(task, reminder, reminder.id, last)
      return periodDays(task, today, PERIOD_DAYS).flatMap((day) => entry(onDay(task, day), reminder, `${reminder.id}-${day.replace(/-/g, '')}`, last))
    })
  })
}

/**
 * Un aviso al acabar cada tarea que dura: "¿Has acabado?", con "Sí" y "Todavía no". No es un
 * recordatorio guardado, sale de la duración: quitarla lo quita, y cambiar hora o duración lo mueve.
 */
export function checkInEntries(state: AppState, now: number): Omit<ScheduleEntry, 'badge'>[] {
  const today = isoOfInstant(now)
  return state.tasks.flatMap((real) => {
    // Con plazo, el del día en que está (mañana, si sigue sin hacer, se programa al abrir la app).
    const task = hasPeriod(real) ? onDay(real, shownDay(real, today) ?? today) : real
    const end = task.done ? null : taskEnd(task)
    if (end === null || end <= now) return []
    const body = [pick(TEXT).question, timeRange(task)].filter(Boolean).join(' · ')
    return [{ id: `${CHECK_IN_PREFIX}${task.id}`, taskId: task.id, at: end, title: task.title, body, overdue: false, ask: true as const }]
  })
}

/** Lo del día primero por hora y luego por el orden de la lista. */
const byTimeThenOrder = (a: Task, b: Task) => compareText(a.time ?? '99:99', b.time ?? '99:99') || byOrder(a, b)

/** Un aviso por día con lo que hay para ese día, si el usuario lo ha activado. */
export function digestEntries(state: AppState, now: number): Omit<ScheduleEntry, 'badge'>[] {
  const { enabled, time } = state.settings.digest
  if (!enabled) return []
  const today = isoOfInstant(now)

  return Array.from({ length: DIGEST_DAYS }, (_, offset) => addDays(today, offset)).flatMap((day) => {
    const at = toInstant(day, time)
    if (at <= now) return []
    const due = state.tasks.filter((task) => !task.done && shownDay(task, day) === day).sort(byTimeThenOrder)
    const overdue = state.tasks.filter((task) => {
      const last = lastDay(task)
      return !task.done && last !== null && last < day
    }).length
    if (!due.length && !overdue) return []

    const text = pick(TEXT)
    const title = [due.length ? text.tasksToday(due.length) : text.nothingToday, overdue ? text.overdue(overdue) : '']
      .filter(Boolean)
      .join(' · ')
    // Solo caben unas pocas: primero las más importantes, y a igualdad, por hora y orden.
    const preview = [...due]
      .sort(byImportance)
      .slice(0, DIGEST_PREVIEW)
      .map((task) => (task.time ? `${shortTime(task.time)} ${task.title}` : task.title))
    const rest = due.length - preview.length
    const body = [...preview, rest > 0 ? `+${rest}` : ''].filter(Boolean).join(' · ')

    return [{ id: `digest-${day.replace(/-/g, '')}`, taskId: null, at, title, body, overdue: overdue > 0 }]
  })
}

/**
 * Un aviso a su hora cada día que toca la rutina, mientras no esté hecha ese día. Tacharla lo quita
 * (el plan se recalcula) y el día siguiente vuelve a sonar.
 */
export function routineEntries(state: AppState, now: number): Omit<ScheduleEntry, 'badge'>[] {
  // Por días de las rutinas: con el día empezando a las 4:00, el aviso de la 1:00 es de la víspera.
  const { dayStart } = state.settings
  const today = routineDay(now, dayStart)
  return state.routines.flatMap((routine) => {
    const { time } = routine
    if (!time) return []
    return Array.from({ length: ROUTINE_DAYS }, (_, offset) => addDays(today, offset)).flatMap((day) => {
      const at = toInstant(occurrenceDate(day, time, dayStart), time)
      if (at <= now || !isDue(routine, day) || isDoneOn(routine, day)) return []
      return [
        {
          id: routineEntryId(routine.id, day),
          taskId: null,
          at,
          title: routine.title,
          body: `${shortTime(time)} · ${daysLabel(routine.days)}`,
          overdue: false,
          routine: { id: routine.id, date: day },
        },
      ]
    })
  })
}

/** Todo lo que debe sonar a partir de ahora, del más cercano al más lejano. */
export function upcomingSchedule(state: AppState, now: number, max = MAX_SCHEDULE): ScheduleEntry[] {
  return [...digestEntries(state, now), ...reminderEntries(state, now), ...checkInEntries(state, now), ...routineEntries(state, now)]
    .sort((a, b) => a.at - b.at)
    .slice(0, max)
    .map((entry) => ({ ...entry, badge: badgeCount(state.tasks, entry.at) }))
}
