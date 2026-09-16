import type { AppState, IsoDate, IsoTime, Task } from '../types'
import type { WidgetChange } from './nativeEvents'
import { addDays, isoOfInstant } from './date'
import { byOrder } from './order'

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
}

export interface WidgetSnapshot {
  version: typeof WIDGET_VERSION
  tasks: WidgetTask[]
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
    .map(({ id, title, date, time, done }) => ({ id, title, date, time, done }))

  return { version: WIDGET_VERSION, tasks }
}

/** Ids a alternar para que la app refleje lo marcado en el widget. Si una tarea se repite, manda lo último. */
export function widgetToggles(tasks: readonly Task[], changes: readonly WidgetChange[]): string[] {
  const wanted = new Map(changes.map(({ taskId, done }) => [taskId, done]))
  return tasks.filter((task) => wanted.has(task.id) && wanted.get(task.id) !== task.done).map((task) => task.id)
}
