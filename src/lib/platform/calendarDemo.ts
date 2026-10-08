import type { CalendarEvent, CalendarInfo, CalendarStatus } from '../calendar'
import { addDays, fromIso, isoOfInstant, toInstant, todayIso } from '../date'
import { pick } from '../i18n'
import type { CalendarSource } from './calendar'

/**
 * Un calendario de muestra para `npm run dev` y las capturas: el de verdad solo existe en el iPhone.
 * Se comporta como él: pide permiso, tiene calendarios de varias cuentas y eventos que se repiten.
 */

const CALENDARS = {
  es: [
    { id: 'demo-work', title: 'Trabajo', color: '#1a73e8', source: 'Google', kind: 'calendar' },
    { id: 'demo-home', title: 'Casa', color: '#34c759', source: 'iCloud', kind: 'calendar' },
    { id: 'demo-holidays', title: 'Festivos en España', color: '#ff3b30', source: 'Suscritos', kind: 'subscribed' },
  ],
  en: [
    { id: 'demo-work', title: 'Work', color: '#1a73e8', source: 'Google', kind: 'calendar' },
    { id: 'demo-home', title: 'Home', color: '#34c759', source: 'iCloud', kind: 'calendar' },
    { id: 'demo-holidays', title: 'US Holidays', color: '#ff3b30', source: 'Subscribed', kind: 'subscribed' },
  ],
} as const satisfies Record<string, readonly CalendarInfo[]>

const TITLES = {
  es: { standup: 'Reunión diaria', review: 'Revisión del proyecto', padel: 'Pádel', call: 'Llamada con Marta', dentist: 'Dentista', birthday: 'Cumpleaños de Lucía', trip: 'Viaje a Lisboa', office: 'Oficina' },
  en: { standup: 'Daily standup', review: 'Project review', padel: 'Tennis', call: 'Call with Marta', dentist: 'Dentist', birthday: 'Lucía’s birthday', trip: 'Trip to Lisbon', office: 'Office' },
} as const

let status: CalendarStatus = import.meta.env.MODE === 'shots' ? 'granted' : 'prompt'
const listeners = new Set<() => void>()

function eventsOn(day: string, today: string): CalendarEvent[] {
  const words = pick(TITLES)
  const color = (id: string) => CALENDARS.es.find((calendar) => calendar.id === id)?.color ?? '#888888'
  const weekday = fromIso(day).getDay()
  const offset = Math.round((fromIso(day).getTime() - fromIso(today).getTime()) / 86_400_000)
  const timed = (id: string, calendarId: string, title: string, from: string, to: string, location: string | null = null): CalendarEvent => {
    const start = toInstant(day, from)
    return { key: `${id}@${start}`, id, calendarId, title, start, end: toInstant(day, to), allDay: false, color: color(calendarId), location }
  }
  const allDay = (id: string, calendarId: string, title: string, days = 1): CalendarEvent => {
    const start = fromIso(day).getTime()
    return { key: `${id}@${start}`, id, calendarId, title, start, end: fromIso(addDays(day, days)).getTime() - 1, allDay: true, color: color(calendarId), location: null }
  }
  const events: CalendarEvent[] = []
  if (weekday >= 1 && weekday <= 5) events.push(timed('standup', 'demo-work', words.standup, '09:30', '09:45', 'Meet'))
  if (weekday === 2 || weekday === 4) events.push(timed('review', 'demo-work', words.review, '12:00', '13:00'))
  if (weekday === 3) events.push(timed('padel', 'demo-home', words.padel, '19:00', '20:30'))
  if (offset === 0) events.push(timed('call', 'demo-work', words.call, '16:00', '16:30'))
  if (offset === 2) events.push(timed('dentist', 'demo-home', words.dentist, '10:15', '11:00', 'Clínica Ruzafa'))
  if (offset === 3) events.push(allDay('birthday', 'demo-home', words.birthday))
  if (offset === 9) events.push(allDay('trip', 'demo-home', words.trip, 3))
  if (day.endsWith('-10-12')) events.push(allDay('holiday', 'demo-holidays', 'Fiesta Nacional de España'))
  return events
}

export const demoCalendar: CalendarSource = {
  status: async () => status,
  request: async () => {
    if (status === 'prompt') status = 'granted'
    return status
  },
  calendars: async () => [...pick(CALENDARS)],
  events: async (from, to, hidden) => {
    const today = todayIso()
    const events: CalendarEvent[] = []
    for (let day = isoOfInstant(from); toInstant(day, '00:00') < to; day = addDays(day, 1)) events.push(...eventsOn(day, today))
    return events.filter((event) => !hidden.includes(event.calendarId))
  },
  open: async () => undefined,
  onChange: (listener) => {
    listeners.add(listener)
    return () => listeners.delete(listener)
  },
}
