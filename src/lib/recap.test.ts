import { afterEach, describe, expect, test } from 'vitest'
import type { Place, Routine, Task } from '../types'
import { toInstant } from './date'
import { setLanguage } from './i18n'
import { RECAP_MIN_DONE, dayPart, greeting, recapOf } from './recap'
import { ALL_DAYS } from './routines'

const TODAY = '2026-11-09'

const task = (id: string, done: boolean, created: string): Task => ({
  id,
  title: id,
  done,
  date: null,
  until: null,
  time: null,
  duration: null,
  reminders: [],
  sectionId: null,
  order: 0,
  importance: 1,
  createdAt: toInstant(created, '10:00'),
  completedAt: done ? toInstant(created, '11:00') : null,
})

const routine = (id: string, done: string[], emoji: string | null = null, created = '2026-10-01'): Routine => ({
  id,
  title: id,
  emoji,
  days: [...ALL_DAYS],
  time: null,
  done,
  order: 0,
  createdAt: toInstant(created, '09:00'),
})

const place = (id: string): Place => ({ id, name: id, aliases: [], location: null, radius: 100 })

const doneTasks = (count: number, created = '2026-10-20') => Array.from({ length: count }, (_, i) => task(`t${i}`, true, created))

describe('recapOf', () => {
  test('sin nada que contar no hay cuaderno (una instalación nueva)', () => {
    expect(recapOf({ tasks: [], routines: [], places: [] }, TODAY)).toBeNull()
    expect(recapOf({ tasks: doneTasks(RECAP_MIN_DONE - 1), routines: [], places: [] }, TODAY)).toBeNull()
  })

  test('cuenta lo tachado, no lo pendiente', () => {
    const tasks = [...doneTasks(5), task('p1', false, '2026-10-20'), task('p2', false, '2026-10-21')]
    expect(recapOf({ tasks, routines: [], places: [] }, TODAY)?.done).toBe(5)
  })

  test('desde lo más antiguo que se conserva, tarea o rutina, con hoy incluido en los días', () => {
    const recap = recapOf({ tasks: doneTasks(3, '2026-10-20'), routines: [routine('r', [], null, '2026-10-01')], places: [] }, TODAY)
    expect(recap?.since).toBe('2026-10-01')
    expect(recap?.days).toBe(40)
  })

  test('la racha viva más larga, con su emoji', () => {
    const routines = [routine('corta', ['2026-11-08', '2026-11-09'], '📖'), routine('larga', ['2026-11-05', '2026-11-06', '2026-11-07', '2026-11-08'], '💊')]
    expect(recapOf({ tasks: [], routines, places: [] }, TODAY)?.streak).toEqual({ days: 4, emoji: '💊' })
  })

  test('una racha de un día no cuenta, y sin ella ni tareas no hay cuaderno', () => {
    const routines = [routine('r', ['2026-11-09'])]
    expect(recapOf({ tasks: [], routines, places: [] }, TODAY)).toBeNull()
    expect(recapOf({ tasks: doneTasks(3), routines, places: [] }, TODAY)?.streak).toBeNull()
  })

  test('lugares y rutinas, por si no hay racha que enseñar', () => {
    const recap = recapOf({ tasks: doneTasks(4), routines: [routine('a', []), routine('b', [])], places: [place('Casa')] }, TODAY)
    expect(recap?.places).toBe(1)
    expect(recap?.routines).toBe(2)
  })

  test('una fecha imposible (un 0 de una copia rota) no cuenta para desde cuándo', () => {
    const tasks = [...doneTasks(3, '2026-10-20'), { ...task('roto', true, '2026-10-20'), createdAt: 0 }]
    expect(recapOf({ tasks, routines: [], places: [] }, TODAY)?.since).toBe('2026-10-20')
  })

  test('una fecha de creación en el futuro (reloj cambiado) no da días negativos', () => {
    const recap = recapOf({ tasks: doneTasks(3, '2026-12-01'), routines: [], places: [] }, TODAY)
    expect(recap?.since).toBe(TODAY)
    expect(recap?.days).toBe(1)
  })
})

describe('saludo', () => {
  afterEach(() => setLanguage('es'))

  test('en español la tarde dura hasta la cena', () => {
    expect(dayPart(7, 'es')).toBe('morning')
    expect(dayPart(13, 'es')).toBe('afternoon')
    expect(dayPart(20, 'es')).toBe('afternoon')
    expect(dayPart(21, 'es')).toBe('night')
    expect(dayPart(3, 'es')).toBe('night')
  })

  test('en inglés el evening empieza a las seis', () => {
    expect(dayPart(11, 'en')).toBe('morning')
    expect(dayPart(12, 'en')).toBe('afternoon')
    expect(dayPart(18, 'en')).toBe('night')
  })

  test('en el idioma vigente', () => {
    expect(greeting(9)).toBe('Buenos días')
    expect(greeting(16)).toBe('Buenas tardes')
    setLanguage('en')
    expect(greeting(19)).toBe('Good evening')
  })
})
