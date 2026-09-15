import { isValidTime } from '../lib/date'
import { createId } from '../lib/id'
import { applyOrder, moveTask, nextOrder, scopeKey } from '../lib/order'
import { DEFAULT_RADIUS, MAX_PLACES, clampRadius, cleanPlaceName, placeKey } from '../lib/places'
import { snoozed, withReminder } from '../lib/reminders'
import type { AppState, IsoDate, Place, Section, Settings, Task } from '../types'
import type { Action } from './actions'

export const SCHEMA_VERSION = 5

export const defaultSettings = (): Settings => ({ digest: { enabled: false, time: '08:30' } })

export const emptyState = (): AppState => ({
  schemaVersion: SCHEMA_VERSION,
  tasks: [],
  sections: [],
  places: [],
  collapsed: { overdue: false, backlog: false },
  settings: defaultSettings(),
})

const MAX_TITLE = 500

const clean = (value: string) => value.replace(/\s+/g, ' ').trim().slice(0, MAX_TITLE)

/** Aplica `update` a una tarea; si devuelve la misma referencia, el estado no cambia. */
function updateTask(state: AppState, id: string, update: (task: Task) => Task): AppState {
  let changed = false
  const tasks = state.tasks.map((task) => {
    if (task.id !== id) return task
    const next = update(task)
    changed = changed || next !== task
    return next
  })
  return changed ? { ...state, tasks } : state
}

/** Una tarea sin fecha no tiene sección: las secciones agrupan dentro del día. */
const sectionFor = (date: IsoDate | null, sectionId: string | null) => (date ? sectionId : null)

export function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'task/add': {
      const title = clean(action.title)
      if (!title) return state
      const sectionId = sectionFor(action.date, action.sectionId)
      const base: Task = {
        id: action.id ?? createId(),
        title,
        done: false,
        date: action.date,
        time: isValidTime(action.time) ? action.time : null,
        reminders: [],
        sectionId,
        order: nextOrder(state.tasks, scopeKey(action.date, sectionId)),
        createdAt: Date.now(),
        completedAt: null,
      }
      const task = (action.reminders ?? []).reduce((acc, draft) => withReminder(acc, draft, createId()), base)
      return { ...state, tasks: [...state.tasks, task] }
    }

    case 'task/setTime': {
      if (action.time !== null && !isValidTime(action.time)) return state
      return updateTask(state, action.id, (task) => (task.time === action.time ? task : { ...task, time: action.time }))
    }

    case 'reminder/add':
      return updateTask(state, action.taskId, (task) => withReminder(task, action.reminder, createId()))

    case 'reminder/remove':
      return updateTask(state, action.taskId, (task) =>
        task.reminders.some((reminder) => reminder.id === action.reminderId)
          ? { ...task, reminders: task.reminders.filter((reminder) => reminder.id !== action.reminderId) }
          : task,
      )

    case 'task/snooze':
      return updateTask(state, action.id, (task) => snoozed(task, action.at, action.now, createId()))

    case 'task/toggle':
      return updateTask(state, action.id, (task) => ({
        ...task,
        done: !task.done,
        completedAt: task.done ? null : Date.now(),
      }))

    case 'task/rename': {
      const title = clean(action.title)
      if (!title) return state
      return updateTask(state, action.id, (task) => (task.title === title ? task : { ...task, title }))
    }

    case 'task/remove':
      return state.tasks.some((task) => task.id === action.id)
        ? { ...state, tasks: state.tasks.filter((task) => task.id !== action.id) }
        : state

    case 'task/restore':
      return state.tasks.some((task) => task.id === action.task.id)
        ? state
        : { ...state, tasks: [...state.tasks, action.task] }

    case 'task/move': {
      const current = state.tasks.find((task) => task.id === action.id)
      if (!current) return state
      const target = { date: action.date, sectionId: sectionFor(action.date, action.sectionId) }
      // Tocar el día o la sección que ya tiene no debe mandarla al final de su lista.
      const samePlace = current.date === target.date && current.sectionId === target.sectionId
      if (samePlace && action.index === undefined) return state
      return { ...state, tasks: moveTask(state.tasks, action.id, target, action.index) }
    }

    case 'board/commit': {
      const placement = new Map<string, { date: IsoDate | null; sectionId: string | null; order: number }>()
      for (const column of action.columns) {
        column.ids.forEach((id, order) =>
          placement.set(id, { date: column.date, sectionId: sectionFor(column.date, column.sectionId), order }),
        )
      }
      let changed = false
      const tasks = state.tasks.map((task) => {
        const next = placement.get(task.id)
        if (!next) return task
        const unchanged =
          task.date === next.date && task.sectionId === next.sectionId && task.order === next.order
        if (unchanged) return task
        changed = true
        return { ...task, ...next }
      })
      // Soltar una tarea donde estaba no debe guardar ni sincronizar nada.
      return changed ? { ...state, tasks } : state
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

    case 'place/add': {
      const name = cleanPlaceName(action.name)
      const taken = state.places.some((place) => place.id === action.id || placeKey(place.name) === placeKey(name))
      if (!name || taken || state.places.length >= MAX_PLACES) return state
      const place: Place = {
        id: action.id,
        name,
        location: action.location ?? null,
        radius: action.radius === undefined ? DEFAULT_RADIUS : clampRadius(action.radius),
      }
      return { ...state, places: [...state.places, place] }
    }

    case 'place/update': {
      const current = state.places.find((place) => place.id === action.id)
      if (!current) return state
      const next: Place = {
        ...current,
        name: action.name === undefined ? current.name : cleanPlaceName(action.name) || current.name,
        location: action.location === undefined ? current.location : action.location,
        radius: action.radius === undefined ? current.radius : clampRadius(action.radius),
      }
      return { ...state, places: state.places.map((place) => (place.id === action.id ? next : place)) }
    }

    case 'place/remove': {
      if (!state.places.some((place) => place.id === action.id)) return state
      const tasks = state.tasks.map((task) => {
        const reminders = task.reminders.filter((reminder) => reminder.kind !== 'place' || reminder.placeId !== action.id)
        return reminders.length === task.reminders.length ? task : { ...task, reminders }
      })
      return { ...state, tasks, places: state.places.filter((place) => place.id !== action.id) }
    }

    case 'block/toggle':
      return {
        ...state,
        collapsed: { ...state.collapsed, [action.block]: !state.collapsed[action.block] },
      }

    case 'settings/digest': {
      if (action.time !== undefined && !isValidTime(action.time)) return state
      const current = state.settings.digest
      const digest = { enabled: action.enabled ?? current.enabled, time: action.time ?? current.time }
      if (digest.enabled === current.enabled && digest.time === current.time) return state
      return { ...state, settings: { ...state.settings, digest } }
    }

    case 'state/replace':
      return action.state

    case 'state/clear':
      return emptyState()

    default:
      return state
  }
}
