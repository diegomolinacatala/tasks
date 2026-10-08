import { defaultCalendarSettings, normalizeCalendarSettings } from '../lib/calendar'
import { isValidTime } from '../lib/date'
import { extendedDuration, normalizeDuration } from '../lib/duration'
import { cleanEmoji } from '../lib/emoji'
import { createId } from '../lib/id'
import { DEFAULT_IMPORTANCE, clampImportance } from '../lib/importance'
import { applyOrder, applyPlacements, moveTask, nextOrder, rescheduled, scopeKey } from '../lib/order'
import { cleanUntil } from '../lib/period'
import { DEFAULT_RADIUS, MAX_PLACES, clampRadius, cleanAliases, cleanPlaceName, nameTaken } from '../lib/places'
import { snoozed, withReminder } from '../lib/reminders'
import { DAY_START, MAX_ROUTINES, cleanDays, withDay } from '../lib/routines'
import { normalizeWelcome } from '../lib/welcome'
import { isLanguageSetting } from '../lib/i18n'
import type { AppState, IsoDate, Place, Routine, Section, Settings, Task, Theme } from '../types'
import type { Action } from './actions'

export const SCHEMA_VERSION = 15

export const defaultSettings = (): Settings => ({
  digest: { enabled: false, time: '08:30' },
  calendar: defaultCalendarSettings(),
  dictation: false,
  theme: 'auto',
  language: 'auto',
  welcome: 0,
  dayStart: DAY_START,
})

export const THEMES: readonly Theme[] = ['light', 'dark', 'auto']

export const emptyState = (): AppState => ({
  schemaVersion: SCHEMA_VERSION,
  tasks: [],
  sections: [],
  places: [],
  routines: [],
  collapsed: { overdue: false, backlog: false, routines: false },
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

/** Como `updateTask`, para rutinas. */
function updateRoutine(state: AppState, id: string, update: (routine: Routine) => Routine): AppState {
  let changed = false
  const routines = state.routines.map((routine) => {
    if (routine.id !== id) return routine
    const next = update(routine)
    changed = changed || next !== routine
    return next
  })
  return changed ? { ...state, routines } : state
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

const sameDays = (a: readonly number[], b: readonly number[]) => a.length === b.length && a.every((day, index) => day === b[index])

export function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'task/add': {
      const title = clean(action.title)
      // Un id repetido sería la misma tarea aplicada dos veces (la bandeja de Siri se puede releer).
      if (!title || (action.id !== undefined && state.tasks.some((task) => task.id === action.id))) return state
      // Una sección que ya no existe (borrada mientras se escribía) deja la tarea en la raíz del día.
      const known = state.sections.some((section) => section.id === action.sectionId)
      const sectionId = sectionFor(action.date, known ? action.sectionId : null)
      const base: Task = {
        id: action.id ?? createId(),
        title,
        done: false,
        date: action.date,
        until: cleanUntil(action.date, action.until),
        time: isValidTime(action.time) ? action.time : null,
        duration: normalizeDuration(action.duration),
        reminders: [],
        sectionId,
        order: nextOrder(state.tasks, scopeKey(action.date, sectionId)),
        importance: action.importance === undefined ? DEFAULT_IMPORTANCE : clampImportance(action.importance),
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

    case 'task/until': {
      if (action.until !== null && !ISO_DATE.test(action.until)) return state
      return updateTask(state, action.id, (task) => {
        const until = cleanUntil(task.date, action.until)
        return task.until === until ? task : { ...task, until }
      })
    }

    case 'task/setDuration': {
      const duration = action.duration === null ? null : normalizeDuration(action.duration)
      return updateTask(state, action.id, (task) => (task.duration === duration ? task : { ...task, duration }))
    }

    case 'task/extend':
      return updateTask(state, action.id, (task) => {
        const duration = extendedDuration(task, action.now)
        return duration === null ? task : { ...task, duration }
      })

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

    case 'task/importance': {
      if (!Number.isFinite(action.importance)) return state
      const importance = clampImportance(action.importance)
      return updateTask(state, action.id, (task) => (task.importance === importance ? task : { ...task, importance }))
    }

    case 'tasks/reschedule': {
      const tasks = rescheduled(state.tasks, action.ids, action.date)
      return tasks === state.tasks ? state : { ...state, tasks }
    }

    case 'tasks/place': {
      const known = action.placements.filter((placement) => state.tasks.some((task) => task.id === placement.id))
      return known.length ? { ...state, tasks: applyPlacements(state.tasks, known) } : state
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
      const target = { date: action.date, sectionId: sectionFor(action.date, action.sectionId), until: action.until }
      // Tocar el día o la sección que ya tiene no debe mandarla al final de su lista (deshacer puede
      // devolverle solo el plazo).
      const samePlace = current.date === target.date && current.sectionId === target.sectionId
      if (samePlace && action.index === undefined) {
        const until = action.until === undefined ? current.until : cleanUntil(current.date, action.until)
        return until === current.until ? state : updateTask(state, action.id, (task) => ({ ...task, until }))
      }
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
        // Lo que un plazo había traído se queda en el día donde se suelta, con el mismo final.
        return { ...task, ...next, until: cleanUntil(next.date, task.until) }
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
      const taken = state.places.some((place) => place.id === action.id) || nameTaken(state.places, name)
      if (!name || taken || state.places.length >= MAX_PLACES) return state
      const place: Place = {
        id: action.id,
        name,
        aliases: cleanAliases(action.aliases ?? [], name, state.places),
        location: action.location ?? null,
        radius: action.radius === undefined ? DEFAULT_RADIUS : clampRadius(action.radius),
      }
      return { ...state, places: [...state.places, place] }
    }

    case 'place/update': {
      const current = state.places.find((place) => place.id === action.id)
      if (!current) return state
      const wanted = action.name === undefined ? '' : cleanPlaceName(action.name)
      // Dos lugares con el mismo nombre harían ambiguo "al llegar a Mercadona".
      const name = wanted && !nameTaken(state.places, wanted, current.id) ? wanted : current.name
      const others = state.places.filter((place) => place.id !== current.id)
      const next: Place = {
        ...current,
        name,
        aliases: cleanAliases(action.aliases ?? current.aliases, name, others),
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

    case 'routine/add': {
      const title = clean(action.title)
      if (!title || state.routines.length >= MAX_ROUTINES) return state
      if (action.id !== undefined && state.routines.some((routine) => routine.id === action.id)) return state
      const routine: Routine = {
        id: action.id ?? createId(),
        title,
        emoji: cleanEmoji(action.emoji),
        days: cleanDays(action.days),
        time: isValidTime(action.time) ? action.time : null,
        done: [],
        order: state.routines.reduce((max, item) => Math.max(max, item.order + 1), 0),
        createdAt: Date.now(),
      }
      return { ...state, routines: [...state.routines, routine] }
    }

    case 'routine/update':
      return updateRoutine(state, action.id, (routine) => {
        const title = action.title === undefined ? routine.title : clean(action.title) || routine.title
        const days = action.days === undefined ? routine.days : cleanDays(action.days)
        const time = action.time === undefined ? routine.time : isValidTime(action.time) ? action.time : null
        const emoji = action.emoji === undefined ? routine.emoji : cleanEmoji(action.emoji)
        const same = title === routine.title && sameDays(days, routine.days) && time === routine.time && emoji === routine.emoji
        return same ? routine : { ...routine, title, days, time, emoji }
      })

    case 'routine/toggle':
      if (!ISO_DATE.test(action.date)) return state
      return updateRoutine(state, action.id, (routine) => ({
        ...routine,
        done: withDay(routine.done, action.date, !routine.done.includes(action.date)),
      }))

    case 'routine/set':
      if (!ISO_DATE.test(action.date)) return state
      return updateRoutine(state, action.id, (routine) => {
        const done = withDay(routine.done, action.date, action.done)
        return done === routine.done ? routine : { ...routine, done }
      })

    case 'routine/remove':
      return state.routines.some((routine) => routine.id === action.id)
        ? { ...state, routines: state.routines.filter((routine) => routine.id !== action.id) }
        : state

    case 'routine/restore':
      return state.routines.some((routine) => routine.id === action.routine.id)
        ? state
        : { ...state, routines: [...state.routines, action.routine] }

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

    case 'settings/dictation':
      if (state.settings.dictation === action.allowed) return state
      return { ...state, settings: { ...state.settings, dictation: action.allowed } }

    case 'settings/theme':
      if (!THEMES.includes(action.theme) || state.settings.theme === action.theme) return state
      return { ...state, settings: { ...state.settings, theme: action.theme } }

    case 'settings/language':
      if (!isLanguageSetting(action.language) || state.settings.language === action.language) return state
      return { ...state, settings: { ...state.settings, language: action.language } }

    case 'settings/dayStart':
      if (!isValidTime(action.time) || state.settings.dayStart === action.time) return state
      return { ...state, settings: { ...state.settings, dayStart: action.time } }

    case 'settings/calendar': {
      const current = state.settings.calendar
      const calendar = normalizeCalendarSettings({ enabled: action.enabled ?? current.enabled, hidden: action.hidden ?? current.hidden })
      const sameHidden = calendar.hidden.length === current.hidden.length && calendar.hidden.every((id, index) => id === current.hidden[index])
      if (calendar.enabled === current.enabled && sameHidden) return state
      return { ...state, settings: { ...state.settings, calendar } }
    }

    // Lo visto no se olvida: una versión anterior (o rota) no cambia nada.
    case 'settings/welcome': {
      const welcome = normalizeWelcome(action.version)
      if (welcome <= state.settings.welcome) return state
      return { ...state, settings: { ...state.settings, welcome } }
    }

    case 'state/replace':
      return action.state

    // El permiso del dictado, la apariencia, el idioma, el calendario y la bienvenida vista son de este
    // dispositivo: una copia de otro no los cambia.
    case 'state/import':
      return {
        ...action.state,
        settings: {
          ...action.state.settings,
          dictation: state.settings.dictation,
          theme: state.settings.theme,
          language: state.settings.language,
          calendar: state.settings.calendar,
          welcome: state.settings.welcome,
        },
      }

    // Borrarlo todo no cambia cómo se ve la app, su idioma, su calendario ni vuelve a enseñar la bienvenida.
    case 'state/clear':
      return {
        ...emptyState(),
        settings: {
          ...defaultSettings(),
          theme: state.settings.theme,
          language: state.settings.language,
          calendar: state.settings.calendar,
          welcome: state.settings.welcome,
        },
      }

    default:
      return state
  }
}
