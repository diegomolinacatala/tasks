import type { AppState, IsoDate, IsoTime, Routine, Task } from '../types'
import type { RoutineChange, WidgetChange } from './nativeEvents'
import { addDays, isoOfInstant } from './date'
import { byOrder } from './order'
import { byRoutineOrder } from './routines'

/**
 * Foto de las tareas que lee el widget de la pantalla de inicio (solo iPhone). Lleva lo
 * atrasado y los próximos días: a medianoche el widget pasa al día siguiente sin abrir la app.
 * El widget decide qué es atrasado y qué es de hoy (`WidgetDay` en `WidgetStore.swift`).
 */
export const WIDGET_DAYS = 7
/** El widget enseña una decena como mucho; el tope solo evita escribir fotos enormes. */
export const WIDGET_MAX_TASKS = 200
const WIDGET_VERSION = 1

export interface WidgetTask {
  id: string
  title: string
  date: IsoDate
  time: IsoTime | null
  done: boolean
  /** 1 a 10: el widget agranda el título y, donde solo caben dos, enseña las más importantes. */
  importance: number
}

/**
 * Rutina para el widget de la pantalla de bloqueo, que la tacha de un toque. El widget decide qué
 * toca cada día (`days`) y si está hecha (`done`): a medianoche amanece pendiente sin abrir la app.
 */
export interface WidgetRoutine {
  id: string
  title: string
  /** Lo que enseña el widget en lugar de las iniciales. Falta en las fotos anteriores al emoji. */
  emoji: string | null
  time: IsoTime | null
  /** 1 = lunes … 7 = domingo. */
  days: number[]
  /** Días hechos desde hace una semana. */
  done: IsoDate[]
}

export interface WidgetSnapshot {
  version: typeof WIDGET_VERSION
  tasks: WidgetTask[]
  /** Falta en las fotos de antes de las rutinas: el widget lo trata como ninguna. */
  routines: WidgetRoutine[]
}

/** Días de diario que lleva la foto: el widget solo mira hoy, y la semana da para sus puntos. */
const WIDGET_ROUTINE_DAYS = 7

function widgetRoutines(routines: readonly Routine[], today: IsoDate): WidgetRoutine[] {
  const since = addDays(today, -WIDGET_ROUTINE_DAYS)
  return [...routines]
    .sort(byRoutineOrder)
    .map(({ id, title, emoji, time, days, done }) => ({ id, title, emoji, time, days, done: done.filter((day) => day >= since) }))
}

type Dated = Task & { date: IsoDate }

/** Lo que se ve: pendiente con fecha hasta el último día de la foto; lo hecho, solo de hoy en adelante. */
const visible = (task: Task, today: IsoDate, last: IsoDate): task is Dated =>
  task.date !== null && task.date <= last && (!task.done || task.date >= today)

export function widgetSnapshot(state: AppState, now: number): WidgetSnapshot {
  const today = isoOfInstant(now)
  const last = addDays(today, WIDGET_DAYS)
  const sectionRank = new Map([...state.sections].sort((a, b) => a.order - b.order).map((section, index) => [section.id, index]))
  const rank = (task: Task) => (task.sectionId === null ? -1 : (sectionRank.get(task.sectionId) ?? -1))

  // Por día; dentro del día, raíz y secciones como en la pantalla principal. Lo atrasado ignora
  // la sección, igual que el bloque Atrasadas.
  const compare = (a: Dated, b: Dated) =>
    a.date.localeCompare(b.date) || (a.date < today ? 0 : rank(a) - rank(b)) || byOrder(a, b)

  const tasks = state.tasks
    .filter((task) => visible(task, today, last))
    .sort(compare)
    .slice(0, WIDGET_MAX_TASKS)
    .map(({ id, title, date, time, done, importance }) => ({ id, title, date, time, done, importance }))

  return { version: WIDGET_VERSION, tasks, routines: widgetRoutines(state.routines, today) }
}

/** Ids a alternar para que la app refleje lo marcado en el widget. Si una tarea se repite, manda lo último. */
export function widgetToggles(tasks: readonly Task[], changes: readonly WidgetChange[]): string[] {
  const wanted = new Map(changes.map(({ taskId, done }) => [taskId, done]))
  return tasks.filter((task) => wanted.has(task.id) && wanted.get(task.id) !== task.done).map((task) => task.id)
}

/** Lo que hay que dejar como dice el widget: solo rutinas que existen y días que cambian. */
export function routineSettles(routines: readonly Routine[], changes: readonly RoutineChange[]): RoutineChange[] {
  const byId = new Map(routines.map((routine) => [routine.id, routine]))
  return changes.filter((change) => {
    const routine = byId.get(change.routineId)
    return routine !== undefined && routine.done.includes(change.date) !== change.done
  })
}
