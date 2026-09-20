import { describe, expect, test } from 'vitest'
import type { Task } from '../types'
import { toInstant } from './date'
import {
  AGAIN_MINUTES,
  MAX_DURATION,
  MIN_DURATION,
  clampDuration,
  durationFromEnd,
  durationLabel,
  endClock,
  extendedDuration,
  normalizeDuration,
  spanLabel,
  taskEnd,
  timeRange,
} from './duration'

const TODAY = '2026-09-11'
const MINUTE = 60_000

const task = (partial: Partial<Task> = {}): Task => ({
  id: 't',
  title: 'Reunión con Jorge',
  done: false,
  date: TODAY,
  time: '17:30',
  duration: 60,
  reminders: [],
  sectionId: null,
  order: 0,
  createdAt: 0,
  importance: 1,
  completedAt: null,
  ...partial,
})

describe('clampDuration y normalizeDuration', () => {
  test('redondea y se queda entre el mínimo y el máximo', () => {
    expect(clampDuration(59.4)).toBe(59)
    expect(clampDuration(1)).toBe(MIN_DURATION)
    expect(clampDuration(99_999)).toBe(MAX_DURATION)
  })

  test('lo que no es un número de minutos válido no es duración', () => {
    expect(normalizeDuration(undefined)).toBeNull()
    expect(normalizeDuration(null)).toBeNull()
    expect(normalizeDuration('60')).toBeNull()
    expect(normalizeDuration(Number.NaN)).toBeNull()
    expect(normalizeDuration(0)).toBeNull()
    expect(normalizeDuration(-30)).toBeNull()
    expect(normalizeDuration(45)).toBe(45)
  })
})

describe('taskEnd', () => {
  test('es la hora de la tarea más lo que dura', () => {
    expect(taskEnd(task())).toBe(toInstant(TODAY, '18:30'))
  })

  test('sin fecha, sin hora o sin duración no acaba en ningún momento', () => {
    expect(taskEnd(task({ duration: null }))).toBeNull()
    expect(taskEnd(task({ time: null }))).toBeNull()
    expect(taskEnd(task({ date: null }))).toBeNull()
  })
})

describe('etiquetas', () => {
  test('la duración se lee en horas y minutos', () => {
    expect(durationLabel(15)).toBe('15 min')
    expect(durationLabel(60)).toBe('1 h')
    expect(durationLabel(90)).toBe('1 h 30')
    expect(durationLabel(120)).toBe('2 h')
  })

  test('el tramo es de la hora de empezar a la de acabar', () => {
    expect(spanLabel('17:30', 60)).toBe('17:30–18:30')
    expect(spanLabel('09:00', 45)).toBe('9:00–9:45')
    expect(spanLabel('17:30', null)).toBe('17:30')
    expect(timeRange(task())).toBe('17:30–18:30')
    expect(timeRange(task({ date: null }))).toBeNull()
  })

  test('pasada la medianoche vuelve a empezar el reloj', () => {
    expect(endClock('23:00', 90)).toBe('00:30')
    expect(spanLabel('23:00', 90)).toBe('23:00–0:30')
  })
})

describe('durationFromEnd', () => {
  test('cuenta los minutos que van de una hora a otra', () => {
    expect(durationFromEnd('17:30', '18:30')).toBe(60)
    expect(durationFromEnd('09:00', '09:45')).toBe(45)
  })

  test('una hora de acabar que no es mayor se entiende del día siguiente', () => {
    expect(durationFromEnd('23:00', '00:30')).toBe(90)
  })
})

describe('extendedDuration', () => {
  const NOW = toInstant(TODAY, '18:30')

  test('alarga la tarea para volver a preguntar dentro de un rato', () => {
    expect(extendedDuration(task(), NOW)).toBe(60 + AGAIN_MINUTES)
  })

  test('respondiendo tarde se cuenta desde ahora, no desde el final previsto', () => {
    // El aviso lleva 40 min en la pantalla: preguntar otra vez "a las 18:45" ya habría pasado.
    const late = NOW + 40 * MINUTE
    expect(extendedDuration(task(), late)).toBe(100 + AGAIN_MINUTES)
  })

  test('sin hora o sin duración no hay nada que alargar', () => {
    expect(extendedDuration(task({ duration: null }), NOW)).toBeNull()
    expect(extendedDuration(task({ time: null }), NOW)).toBeNull()
  })

  test('no pasa del máximo, y ahí deja de cambiar', () => {
    expect(extendedDuration(task({ duration: MAX_DURATION }), NOW)).toBeNull()
  })
})
