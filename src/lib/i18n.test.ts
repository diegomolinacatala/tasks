import { afterEach, describe, expect, test } from 'vitest'
import { emptyState } from '../state/reducer'
import type { AppState, Task } from '../types'
import { addLabel, composeTargets } from './compose'
import { dayHeading, fullLabel, rangeLabel, relativeLabel, shortTime } from './date'
import { durationLabel, spanLabel } from './duration'
import { addFromText, sharesDictation } from './headless'
import { language, pick, resolveLanguage, setLanguage, systemLanguage } from './i18n'
import { reminderLabel } from './reminders'
import { daysLabel, dayLetters } from './routines'
import { notificationBody, upcomingSchedule } from './schedule'
import { freeLabel } from './timeline'

afterEach(() => setLanguage('es'))

describe('qué idioma toca', () => {
  test('el primero de los del sistema que la app habla', () => {
    expect(systemLanguage(['es-ES', 'en-US'])).toBe('es')
    expect(systemLanguage(['en-GB'])).toBe('en')
    expect(systemLanguage(['ca-ES', 'es-ES'])).toBe('es')
    expect(systemLanguage(['es_MX'])).toBe('es')
  })

  test('si no habla ninguno, inglés', () => {
    expect(systemLanguage(['fr-FR', 'de-DE'])).toBe('en')
    expect(systemLanguage([])).toBe('en')
  })

  test('lo elegido manda; en automático, el sistema', () => {
    expect(resolveLanguage('es', ['en-US'])).toBe('es')
    expect(resolveLanguage('en', ['es-ES'])).toBe('en')
    expect(resolveLanguage('auto', ['en-US'])).toBe('en')
  })

  test('pick da lo del idioma vigente', () => {
    expect(language()).toBe('es')
    expect(pick({ es: 'Hoy', en: 'Today' })).toBe('Hoy')
    setLanguage('en')
    expect(pick({ es: 'Hoy', en: 'Today' })).toBe('Today')
  })
})

describe('textos en inglés', () => {
  test('fechas', () => {
    setLanguage('en')
    expect(relativeLabel('2026-09-11', '2026-09-11')).toBe('Today')
    expect(relativeLabel('2026-09-18', '2026-09-11')).toBe('Fri, Sep 18')
    expect(fullLabel('2026-09-11')).toBe('Friday, Sep 11')
    expect(rangeLabel('2026-09-07', '2026-09-13')).toBe('Sep 7 – 13')
    expect(rangeLabel('2026-09-28', '2026-10-04')).toBe('Sep 28 – Oct 4')
    expect(dayHeading('2026-10-01', '2026-09-29')).toEqual({ main: 'Thursday', rest: 'October 1' })
    expect(dayHeading('2026-09-29', '2026-09-29')).toEqual({ main: 'Today', rest: 'Tuesday 29' })
  })

  test('en español, como siempre', () => {
    expect(relativeLabel('2026-09-18', '2026-09-11')).toBe('vie 18 sept')
    expect(fullLabel('2026-09-11')).toBe('viernes, 11 sept')
    expect(dayHeading('2026-10-01', '2026-09-29')).toEqual({ main: 'Jueves', rest: '1 octubre' })
  })

  test('horas de 12 horas', () => {
    setLanguage('en')
    expect(shortTime('09:05')).toBe('9:05 AM')
    expect(shortTime('17:30')).toBe('5:30 PM')
    expect(shortTime('00:00')).toBe('12:00 AM')
    expect(shortTime('12:00')).toBe('12:00 PM')
    expect(spanLabel('17:30', 60)).toBe('5:30–6:30 PM')
    expect(spanLabel('11:30', 90)).toBe('11:30 AM–1:00 PM')
  })

  test('duraciones, avisos y rutinas', () => {
    setLanguage('en')
    expect(durationLabel(45)).toBe('45 min')
    expect(durationLabel(90)).toBe('1h 30m')
    expect(freeLabel(60)).toBe('1h free')
    expect(reminderLabel({ kind: 'before', minutes: 0 }, 0)).toBe('On time')
    expect(reminderLabel({ kind: 'before', minutes: 60 }, 0)).toBe('1 hr before')
    expect(daysLabel([1, 3, 5])).toBe('Mon, Wed and Fri')
    expect(daysLabel([6])).toBe('Saturdays')
    expect(dayLetters()).toEqual(['M', 'T', 'W', 'T', 'F', 'S', 'S'])
  })

  test('el compositor', () => {
    setLanguage('en')
    expect(composeTargets(null, '2026-09-11').map((target) => target.label)).toEqual(['No date', 'Today', 'Tomorrow'])
    expect(addLabel('2026-09-17', '2026-09-11')).toBe('Add to Thursday 17')
    expect(addLabel(null, '2026-09-11')).toBe('Add to inbox')
  })
})

const task = (partial: Partial<Task> & { id: string }): Task => ({
  title: partial.id,
  done: false,
  date: '2026-09-11',
  until: null,
  time: null,
  duration: null,
  reminders: [],
  sectionId: null,
  order: 0,
  importance: 1,
  createdAt: 0,
  completedAt: null,
  ...partial,
})

describe('avisos en inglés', () => {
  test('el cuerpo dice cuándo toca', () => {
    setLanguage('en')
    const at = new Date(2026, 8, 11, 16, 50).getTime()
    expect(notificationBody(task({ id: 'a', time: '17:00' }), at, [])).toBe('In 10 min · 5:00 PM')
    expect(notificationBody(task({ id: 'b', date: '2026-09-12' }), at, [])).toBe('Due tomorrow')
  })

  test('la pregunta al acabar', () => {
    setLanguage('en')
    const state: AppState = { ...emptyState(), tasks: [task({ id: 'r', title: 'Meeting', time: '17:00', duration: 60 })] }
    const ask = upcomingSchedule(state, new Date(2026, 8, 11, 10).getTime()).find((entry) => entry.ask)
    expect(ask?.body).toBe('Finished? · 5:00–6:00 PM')
  })
})

describe('Siri en inglés', () => {
  const saved = (language: AppState['settings']['language']) =>
    JSON.parse(JSON.stringify({ ...emptyState(), settings: { ...emptyState().settings, language, dictation: true } }))
  const now = new Date(2026, 8, 11, 10).getTime()

  test('en automático con iOS en inglés, entiende y contesta en inglés', () => {
    const result = addFromText(
      { now, text: 'call mom tomorrow at 5pm', interpreted: null, state: saved('auto'), inbox: [], widgetChanges: [], languages: ['en-US'] },
      () => 'id',
    )
    expect(result.entry?.tasks[0]).toMatchObject({ title: 'Call mom', time: '17:00' })
    expect(result.message).toBe('Added: Call mom, tomorrow 5:00 PM.')
  })

  test('lo elegido en la app manda sobre iOS', () => {
    const result = addFromText(
      { now, text: 'llamar a mamá mañana a las 5', interpreted: null, state: saved('es'), inbox: [], widgetChanges: [], languages: ['en-US'] },
      () => 'id',
    )
    expect(result.message).toBe('Apuntada: Llamar a mamá, mañana 17:00.')
  })

  test('en inglés lo dicho no va a la IA del servidor, que solo entiende español', () => {
    expect(sharesDictation(saved('en'))).toBe(false)
    expect(sharesDictation(saved('es'))).toBe(true)
    expect(sharesDictation(saved('auto'), ['en-GB'])).toBe(false)
  })
})
