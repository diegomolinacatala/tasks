import { parseCalendarEvents, parseCalendarStatus, parseCalendars } from '../calendar'
import type { CalendarSource } from './calendar'

/** El calendario del iPhone, por el plugin propio (`CalendarBridge.swift`). Todo llega sin validar. */
export const nativeSource: CalendarSource = {
  status: async () => {
    const { TasksNative } = await import('./native')
    return parseCalendarStatus((await TasksNative.calendarStatus()).status)
  },
  request: async () => {
    const { TasksNative } = await import('./native')
    return parseCalendarStatus((await TasksNative.requestCalendarAccess()).status)
  },
  calendars: async () => {
    const { TasksNative } = await import('./native')
    return parseCalendars((await TasksNative.calendars()).calendars)
  },
  events: async (from, to, hidden) => {
    const { TasksNative } = await import('./native')
    return parseCalendarEvents((await TasksNative.calendarEvents({ from, to, hidden: [...hidden] })).events)
  },
  open: async (event) => {
    const { TasksNative } = await import('./native')
    await TasksNative.showEvent({ id: event.id, start: event.start })
  },
  createOwn: async (title) => {
    const { TasksNative } = await import('./native')
    const { id } = await TasksNative.createTasksCalendar({ title })
    return typeof id === 'string' && id ? id : null
  },
  syncTasks: async (calendarId, items) => {
    const { TasksNative } = await import('./native')
    await TasksNative.syncTaskEvents({ calendarId, events: [...items] })
  },
  onChange: (listener) => {
    let removed = false
    let remove: (() => void) | null = null
    void import('./native')
      .then(({ TasksNative }) => TasksNative.addListener('calendarChanged', listener))
      .then((handle) => {
        remove = () => void handle.remove()
        if (removed) remove()
      })
      .catch(() => undefined)
    return () => {
      removed = true
      remove?.()
    }
  },
}
