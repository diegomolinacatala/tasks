import { afterEach, describe, expect, test } from 'vitest'
import type { CalendarEvent, CalendarInfo } from './calendar'
import {
  FALLBACK_COLOR,
  MAX_EVENTS,
  MAX_HIDDEN,
  addedCalendars,
  calendarGroups,
  eventDays,
  eventSpan,
  eventWindow,
  eventsOfDay,
  normalizeCalendarSettings,
  parseCalendarEvents,
  parseCalendarStatus,
  parseCalendars,
  toggleHidden,
  widgetEvents,
  windowCovers,
} from './calendar'
import { fromIso, toInstant } from './date'
import { setLanguage } from './i18n'
import { buildTimeline, timelineItems } from './timeline'

const DAY = '2026-10-08'

const event = (id: string, start: number, end: number, extra: Partial<CalendarEvent> = {}): CalendarEvent => ({
  key: `${id}@${start}`,
  id,
  calendarId: 'trabajo',
  title: id,
  start,
  end,
  allDay: false,
  color: '#1a73e8',
  location: null,
  ...extra,
})

const at = (day: string, time: string) => toInstant(day, time)

const calendar = (id: string, source: string, title = id): CalendarInfo => ({ id, title, color: '#34c759', source, kind: 'calendar', writable: true, own: false })

afterEach(() => setLanguage('es'))

describe('parseCalendarStatus', () => {
  test('lo que no sea concedido o por pedir cuenta como negado', () => {
    expect(parseCalendarStatus('granted')).toBe('granted')
    expect(parseCalendarStatus('prompt')).toBe('prompt')
    expect(parseCalendarStatus('writeOnly')).toBe('denied')
    expect(parseCalendarStatus(undefined)).toBe('denied')
  })
})

describe('parseCalendarEvents', () => {
  test('valida lo que llega de EventKit y le pone una clave por ocurrencia', () => {
    const start = at(DAY, '17:00')
    const [parsed] = parseCalendarEvents([
      { id: 'abc', calendarId: 'c1', title: '  Reunión   con Jorge ', start, end: start + 3_600_000, allDay: false, color: '#1A73E8', location: 'Sala 2' },
    ])
    expect(parsed).toEqual({
      key: `abc@${start}`,
      id: 'abc',
      calendarId: 'c1',
      title: 'Reunión con Jorge',
      start,
      end: start + 3_600_000,
      allDay: false,
      color: '#1a73e8',
      location: 'Sala 2',
    })
  })

  test('descarta lo que no tiene id o fechas, repetidos y basura; el color raro pasa a uno neutro', () => {
    const start = at(DAY, '09:00')
    const parsed = parseCalendarEvents([
      null,
      'x',
      { id: '', start, end: start },
      { id: 'sin-fin', start },
      { id: 'a', start, end: start - 10, color: 'red', location: '' },
      { id: 'a', start, end: start },
    ])
    expect(parsed).toHaveLength(1)
    expect(parsed[0]).toMatchObject({ id: 'a', end: start, color: FALLBACK_COLOR, location: null, title: '' })
    expect(parseCalendarEvents({})).toEqual([])
  })

  test('las ocurrencias de un evento que se repite son distintas', () => {
    const monday = at(DAY, '09:30')
    const tuesday = at('2026-10-09', '09:30')
    expect(parseCalendarEvents([{ id: 'diaria', start: monday, end: monday }, { id: 'diaria', start: tuesday, end: tuesday }])).toHaveLength(2)
  })

  test('tiene tope', () => {
    const start = at(DAY, '09:00')
    const many = Array.from({ length: MAX_EVENTS + 20 }, (_, index) => ({ id: `e${index}`, start, end: start }))
    expect(parseCalendarEvents(many)).toHaveLength(MAX_EVENTS)
  })
})

describe('parseCalendars', () => {
  test('con id y nombre; el tipo desconocido es un calendario normal', () => {
    expect(
      parseCalendars([
        { id: 'c1', title: 'Trabajo', color: '#1a73e8', source: 'Gmail', kind: 'calendar', writable: true },
        { id: 'c2', title: 'Festivos', color: '#ff3b30', source: 'Suscritos', kind: 'subscribed' },
        { id: 'c3', title: 'Raro', source: 'iCloud', kind: 'otra-cosa', own: true },
        { id: '', title: 'Sin id' },
        { id: 'c4' },
      ]),
    ).toEqual([
      { id: 'c1', title: 'Trabajo', color: '#1a73e8', source: 'Gmail', kind: 'calendar', writable: true, own: false },
      { id: 'c2', title: 'Festivos', color: '#ff3b30', source: 'Suscritos', kind: 'subscribed', writable: false, own: false },
      { id: 'c3', title: 'Raro', color: FALLBACK_COLOR, source: 'iCloud', kind: 'calendar', writable: false, own: true },
    ])
  })
})

describe('normalizeCalendarSettings', () => {
  test('lo de antes del calendario está apagado', () => {
    expect(normalizeCalendarSettings(undefined)).toEqual({ enabled: false, hidden: [], export: null })
    expect(normalizeCalendarSettings({ enabled: true, hidden: [] }).export).toBeNull()
  })

  test('ocultos: solo textos, sin repetir y con tope', () => {
    const many = Array.from({ length: MAX_HIDDEN + 5 }, (_, index) => `c${index}`)
    expect(normalizeCalendarSettings({ enabled: true, hidden: ['a', 'a', 3, '', 'b'], export: 'trabajo' })).toEqual({
      enabled: true,
      hidden: ['a', 'b'],
      export: 'trabajo',
    })
    expect(normalizeCalendarSettings({ enabled: 'sí', hidden: many }).hidden).toHaveLength(MAX_HIDDEN)
  })
})

describe('toggleHidden', () => {
  test('oculta y vuelve a enseñar sin tocar el original', () => {
    const hidden = ['a']
    expect(toggleHidden(hidden, 'b')).toEqual(['a', 'b'])
    expect(toggleHidden(hidden, 'a')).toEqual([])
    expect(hidden).toEqual(['a'])
  })
})

describe('eventsOfDay', () => {
  test('reparte en todo el día y con hora, en minutos de ese día y en orden', () => {
    const lunch = event('comida', at(DAY, '14:00'), at(DAY, '15:30'))
    const standup = event('diaria', at(DAY, '09:30'), at(DAY, '09:45'))
    const birthday = event('cumple', fromIso(DAY).getTime(), fromIso('2026-10-09').getTime() - 1, { allDay: true })
    const tomorrow = event('mañana', at('2026-10-09', '10:00'), at('2026-10-09', '11:00'))
    const day = eventsOfDay([lunch, tomorrow, birthday, standup], DAY)
    expect(day.allDay.map((item) => item.id)).toEqual(['cumple'])
    expect(day.timed.map((item) => [item.event.id, item.start, item.end])).toEqual([
      ['diaria', 570, 585],
      ['comida', 840, 930],
    ])
  })

  test('lo que cruza la medianoche sale en los dos días, recortado', () => {
    const party = event('fiesta', at(DAY, '22:00'), at('2026-10-09', '02:00'))
    expect(eventsOfDay([party], DAY).timed[0]).toMatchObject({ start: 22 * 60, end: 24 * 60 })
    expect(eventsOfDay([party], '2026-10-09').timed[0]).toMatchObject({ start: 0, end: 120 })
    expect(eventsOfDay([party], '2026-10-10').timed).toEqual([])
  })

  test('uno con hora que cubre el día entero cuenta como de todo el día', () => {
    const trip = event('viaje', at('2026-10-07', '18:00'), at('2026-10-10', '12:00'))
    const day = eventsOfDay([trip], DAY)
    expect(day.allDay.map((item) => item.id)).toEqual(['viaje'])
    expect(day.timed).toEqual([])
  })

  test('uno de todo el día de varios días sale en cada uno, y no al siguiente de acabar', () => {
    const holidays = event('vacaciones', fromIso('2026-10-07').getTime(), fromIso('2026-10-10').getTime() - 1, { allDay: true })
    expect(eventsOfDay([holidays], DAY).allDay).toHaveLength(1)
    expect(eventsOfDay([holidays], '2026-10-09').allDay).toHaveLength(1)
    expect(eventsOfDay([holidays], '2026-10-10').allDay).toHaveLength(0)
  })

  test('uno que no dura nada sale a su hora', () => {
    const reminder = event('recordatorio', at(DAY, '08:00'), at(DAY, '08:00'))
    expect(eventsOfDay([reminder], DAY).timed[0]).toMatchObject({ start: 480, end: 480 })
    expect(eventsOfDay([event('fin', fromIso('2026-10-09').getTime(), fromIso('2026-10-09').getTime())], DAY).timed).toEqual([])
  })
})

describe('eventSpan', () => {
  test('el tramo como en las tareas', () => {
    expect(eventSpan({ start: 17 * 60, end: 18 * 60 + 30 })).toBe('17:00–18:30')
    expect(eventSpan({ start: 9 * 60, end: 9 * 60 })).toBe('9:00')
    setLanguage('en')
    expect(eventSpan({ start: 17 * 60, end: 18 * 60 + 30 })).toBe('5:00–6:30 PM')
  })
})

describe('eventWindow', () => {
  test('el mes con una semana antes y dos después', () => {
    expect(eventWindow(DAY)).toEqual({ from: '2026-09-24', to: '2026-11-15' })
    expect(eventWindow('2026-12-31')).toEqual({ from: '2026-11-24', to: '2027-01-15' })
  })

  test('cubre los días de dentro; el último no entra', () => {
    const window = eventWindow(DAY)
    expect(windowCovers(window, '2026-09-24')).toBe(true)
    expect(windowCovers(window, '2026-11-14')).toBe(true)
    expect(windowCovers(window, '2026-11-15')).toBe(false)
    expect(windowCovers(null, DAY)).toBe(false)
  })
})

describe('calendarGroups', () => {
  test('por cuenta y por nombre', () => {
    const groups = calendarGroups([calendar('trabajo', 'Gmail', 'Trabajo'), calendar('casa', 'iCloud', 'Casa'), calendar('cumples', 'Gmail', 'Cumpleaños')])
    expect(groups.map((group) => [group.source, group.calendars.map((item) => item.title)])).toEqual([
      ['Gmail', ['Cumpleaños', 'Trabajo']],
      ['iCloud', ['Casa']],
    ])
  })
})

describe('addedCalendars', () => {
  test('los que aparecen; la primera lectura no cuenta como nuevos', () => {
    const before = [calendar('casa', 'iCloud')]
    expect(addedCalendars(before, [...before, calendar('trabajo', 'Gmail')]).map((item) => item.id)).toEqual(['trabajo'])
    expect(addedCalendars([], before)).toEqual([])
    expect(addedCalendars(before, [...before, { ...calendar('tasks', 'iCloud'), own: true }])).toEqual([])
  })
})

describe('widgetEvents', () => {
  test('lo que toca la ventana, en orden y con lo justo', () => {
    const from = at(DAY, '00:00')
    const to = at('2026-10-15', '00:00')
    const late = event('tarde', at(DAY, '18:00'), at(DAY, '19:00'))
    const early = event('pronto', at(DAY, '08:00'), at(DAY, '09:00'))
    const past = event('ayer', at('2026-10-07', '10:00'), at('2026-10-07', '11:00'))
    const far = event('lejos', at('2026-10-20', '10:00'), at('2026-10-20', '11:00'))
    expect(widgetEvents([late, past, early, far], from, to)).toEqual([
      { id: early.key, title: 'pronto', start: early.start, end: early.end, allDay: false, color: '#1a73e8' },
      { id: late.key, title: 'tarde', start: late.start, end: late.end, allDay: false, color: '#1a73e8' },
    ])
  })
})

describe('el horario con eventos', () => {
  test('los eventos cuentan para el tiempo libre', () => {
    const meeting = event('reunion', at(DAY, '10:00'), at(DAY, '12:00'))
    const items = timelineItems([], [], eventsOfDay([meeting], DAY).timed)
    expect(items[0]).toMatchObject({ kind: 'event', id: `event:${meeting.key}`, start: 600, end: 720 })
    const rows = buildTimeline(items, 9 * 60)
    expect(rows.map((row) => row.kind)).toEqual(['now', 'gap', 'event'])
  })

  test('uno en curso se va llenando como una tarea', () => {
    const meeting = event('reunion', at(DAY, '10:00'), at(DAY, '12:00'))
    const [row] = buildTimeline(timelineItems([], [], eventsOfDay([meeting], DAY).timed), 11 * 60)
    expect(row).toMatchObject({ kind: 'event', live: 0.5 })
  })
})

describe('eventDays', () => {
  test('cada día que toca un evento, también los de uno de varios días', () => {
    const trip = event('viaje', fromIso('2026-10-09').getTime(), fromIso('2026-10-12').getTime() - 1, { allDay: true })
    const call = event('llamada', at(DAY, '16:00'), at(DAY, '16:30'))
    const late = event('fiesta', at('2026-10-14', '22:00'), at('2026-10-15', '00:00'))
    expect([...eventDays([trip, call, late])].sort()).toEqual(['2026-10-08', '2026-10-09', '2026-10-10', '2026-10-11', '2026-10-14'])
  })
})
