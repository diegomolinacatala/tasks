import { byDisplay, scopeOf } from '../lib/order'
import type { AppState, IsoDate, Section, Task } from '../types'

export interface Group {
  /** `null` = raíz del día (tareas sin sección). */
  section: Section | null
  tasks: Task[]
}

export const sortedSections = (state: AppState): Section[] =>
  [...state.sections].sort((a, b) => a.order - b.order)

export const tasksOn = (state: AppState, date: IsoDate): Task[] =>
  state.tasks.filter((task) => task.date === date).sort(byDisplay)

export const backlogTasks = (state: AppState): Task[] =>
  state.tasks.filter((task) => task.date === null).sort(byDisplay)

export function groupsFor(state: AppState, date: IsoDate): Group[] {
  const inDay = tasksOn(state, date)
  const pick = (sectionId: string | null) => inDay.filter((task) => task.sectionId === sectionId)
  return [
    { section: null, tasks: pick(null) },
    ...sortedSections(state).map((section) => ({ section, tasks: pick(section.id) })),
  ]
}

export const findTask = (state: AppState, id: string | null): Task | null =>
  id ? (state.tasks.find((task) => task.id === id) ?? null) : null

export const findSection = (state: AppState, id: string | null): Section | null =>
  id ? (state.sections.find((section) => section.id === id) ?? null) : null

export interface Progress {
  total: number
  done: number
  ratio: number
}

export function progressOf(tasks: readonly Task[]): Progress {
  const done = tasks.filter((task) => task.done).length
  return { total: tasks.length, done, ratio: tasks.length ? done / tasks.length : 0 }
}

/** Clave de orden del scope al que pertenece una tarea. */
export const scopeOfTask = scopeOf
