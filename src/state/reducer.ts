import { createId } from '../lib/id'
import { applyOrder, moveTask, nextOrder, scopeKey } from '../lib/order'
import type { AppState, IsoDate, Section, Task } from '../types'
import type { Action } from './actions'

export const SCHEMA_VERSION = 2

export const emptyState = (): AppState => ({
  schemaVersion: SCHEMA_VERSION,
  tasks: [],
  sections: [],
  collapsed: { overdue: false, backlog: false },
})

const MAX_TITLE = 500

const clean = (value: string) => value.replace(/\s+/g, ' ').trim().slice(0, MAX_TITLE)

export function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'task/add': {
      const title = clean(action.title)
      if (!title) return state
      const task: Task = {
        id: createId(),
        title,
        done: false,
        date: action.date,
        sectionId: action.sectionId,
        order: nextOrder(state.tasks, scopeKey(action.date, action.sectionId)),
        createdAt: Date.now(),
        completedAt: null,
      }
      return { ...state, tasks: [...state.tasks, task] }
    }

    case 'task/toggle':
      return {
        ...state,
        tasks: state.tasks.map((task) =>
          task.id === action.id
            ? { ...task, done: !task.done, completedAt: task.done ? null : Date.now() }
            : task,
        ),
      }

    case 'task/rename': {
      const title = clean(action.title)
      if (!title) return state
      return {
        ...state,
        tasks: state.tasks.map((task) => (task.id === action.id ? { ...task, title } : task)),
      }
    }

    case 'task/remove':
      return { ...state, tasks: state.tasks.filter((task) => task.id !== action.id) }

    case 'task/restore':
      return state.tasks.some((task) => task.id === action.task.id)
        ? state
        : { ...state, tasks: [...state.tasks, action.task] }

    case 'task/move':
      return {
        ...state,
        tasks: moveTask(state.tasks, action.id, { date: action.date, sectionId: action.sectionId }, action.index),
      }

    case 'board/commit': {
      const placement = new Map<string, { date: IsoDate | null; sectionId: string | null; order: number }>()
      for (const column of action.columns) {
        column.ids.forEach((id, order) =>
          placement.set(id, { date: column.date, sectionId: column.sectionId, order }),
        )
      }
      return {
        ...state,
        tasks: state.tasks.map((task) => {
          const next = placement.get(task.id)
          if (!next) return task
          const unchanged =
            task.date === next.date && task.sectionId === next.sectionId && task.order === next.order
          return unchanged ? task : { ...task, ...next }
        }),
      }
    }

    case 'scope/reorder':
      return { ...state, tasks: applyOrder(state.tasks, action.scope, action.ids) }

    case 'section/add': {
      const name = clean(action.name)
      if (!name) return state
      const section: Section = {
        id: action.id ?? createId(),
        name,
        order: state.sections.reduce((max, item) => Math.max(max, item.order + 1), 0),
        collapsed: false,
      }
      return { ...state, sections: [...state.sections, section] }
    }

    case 'section/rename': {
      const name = clean(action.name)
      if (!name) return state
      return {
        ...state,
        sections: state.sections.map((section) =>
          section.id === action.id ? { ...section, name } : section,
        ),
      }
    }

    case 'section/toggle':
      return {
        ...state,
        sections: state.sections.map((section) =>
          section.id === action.id ? { ...section, collapsed: !section.collapsed } : section,
        ),
      }

    case 'section/remove': {
      // Las tareas de la sección no se borran: vuelven a la raíz de su día.
      const orphans = state.tasks.filter((task) => task.sectionId === action.id)
      const tasks = orphans.reduce(
        (acc, task) => moveTask(acc, task.id, { date: task.date, sectionId: null }),
        state.tasks,
      )
      return { ...state, tasks, sections: state.sections.filter((section) => section.id !== action.id) }
    }

    case 'sections/reorder': {
      const rank = new Map(action.ids.map((id, index) => [id, index]))
      return {
        ...state,
        sections: state.sections.map((section) => {
          const order = rank.get(section.id)
          return order === undefined ? section : { ...section, order }
        }),
      }
    }

    case 'block/toggle':
      return {
        ...state,
        collapsed: { ...state.collapsed, [action.block]: !state.collapsed[action.block] },
      }

    case 'state/replace':
      return action.state

    case 'state/clear':
      return emptyState()

    default:
      return state
  }
}
