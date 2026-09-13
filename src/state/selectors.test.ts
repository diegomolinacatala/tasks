import { describe, expect, test } from 'vitest'
import type { AppState, Section, Task } from '../types'
import {
  backlogTasks,
  findSection,
  findTask,
  groupsFor,
  isOverdue,
  overdueTasks,
  progressOf,
  sortedSections,
  tasksOn,
} from './selectors'

const TODAY = '2026-09-11'

const task = (partial: Partial<Task> & { id: string }): Task => ({
  title: partial.id,
  done: false,
  date: TODAY,
  time: null,
  reminders: [],
  sectionId: null,
  order: 0,
  createdAt: 0,
  completedAt: null,
  ...partial,
})

const section = (id: string, order: number): Section => ({ id, name: id, order, collapsed: false })

const state: AppState = {
  schemaVersion: 1,
  tasks: [
    task({ id: 'b', order: 1 }),
    task({ id: 'a', order: 0 }),
    task({ id: 'done', order: 0, done: true }),
    task({ id: 'work', order: 0, sectionId: 's1' }),
    task({ id: 'otro-dia', date: '2026-09-12' }),
    task({ id: 'suelta', date: null }),
  ],
  sections: [section('s2', 1), section('s1', 0)],
  collapsed: { overdue: false, backlog: false },
  settings: { digest: { enabled: false, time: '08:30' } },
}

describe('sortedSections', () => {
  test('respeta el orden guardado', () => {
    expect(sortedSections(state).map((s) => s.id)).toEqual(['s1', 's2'])
  })
})

describe('tasksOn', () => {
  test('filtra por día y deja lo completado al final', () => {
    // El orden es relativo a cada sección, así que la lista plana solo garantiza
    // que lo pendiente va antes que lo completado.
    expect(tasksOn(state, TODAY).map((t) => t.id)).toEqual(['a', 'work', 'b', 'done'])
  })

  test('un día sin tareas devuelve lista vacía', () => {
    expect(tasksOn(state, '2030-01-01')).toEqual([])
  })
})

describe('backlogTasks', () => {
  test('solo las tareas sin fecha', () => {
    expect(backlogTasks(state).map((t) => t.id)).toEqual(['suelta'])
  })
})

describe('groupsFor', () => {
  test('la raíz va primero y luego las secciones en orden', () => {
    const groups = groupsFor(state, TODAY)
    expect(groups.map((g) => g.section?.id ?? 'root')).toEqual(['root', 's1', 's2'])
    expect(groups[0]!.tasks.map((t) => t.id)).toEqual(['a', 'b', 'done'])
    expect(groups[1]!.tasks.map((t) => t.id)).toEqual(['work'])
    expect(groups[2]!.tasks).toEqual([])
  })
})

describe('isOverdue', () => {
  test('solo lo pendiente de un día anterior', () => {
    expect(isOverdue(task({ id: 'a', date: '2026-09-10' }), TODAY)).toBe(true)
    expect(isOverdue(task({ id: 'b', date: '2026-09-10', done: true }), TODAY)).toBe(false)
    expect(isOverdue(task({ id: 'c', date: TODAY }), TODAY)).toBe(false)
    expect(isOverdue(task({ id: 'd', date: '2026-09-12' }), TODAY)).toBe(false)
    expect(isOverdue(task({ id: 'e', date: null }), TODAY)).toBe(false)
  })
})

describe('overdueTasks', () => {
  const atrasadas: AppState = {
    ...state,
    tasks: [
      task({ id: 'ayer', date: '2026-09-10' }),
      task({ id: 'antesdeayer', date: '2026-09-09' }),
      task({ id: 'hecha', date: '2026-09-09', done: true }),
      task({ id: 'hoy', date: TODAY }),
    ],
  }

  test('de la más antigua a la más reciente, sin las completadas', () => {
    expect(overdueTasks(atrasadas, TODAY).map((t) => t.id)).toEqual(['antesdeayer', 'ayer'])
  })

  test('sin atrasos devuelve lista vacía', () => {
    expect(overdueTasks({ ...state, tasks: [task({ id: 'hoy' })] }, TODAY)).toEqual([])
  })
})

describe('findTask / findSection', () => {
  test('devuelven null cuando no hay id o no existe', () => {
    expect(findTask(state, null)).toBeNull()
    expect(findTask(state, 'fantasma')).toBeNull()
    expect(findSection(state, null)).toBeNull()
    expect(findSection(state, 's1')?.id).toBe('s1')
  })
})

describe('progressOf', () => {
  test('cuenta completadas y calcula la proporción', () => {
    expect(progressOf(tasksOn(state, TODAY))).toEqual({ total: 4, done: 1, ratio: 0.25 })
  })

  test('una lista vacía no divide por cero', () => {
    expect(progressOf([])).toEqual({ total: 0, done: 0, ratio: 0 })
  })
})
