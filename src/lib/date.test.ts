import { describe, expect, test } from 'vitest'
import {
  addDays,
  diffDays,
  formatTime,
  isValidTime,
  isoOfInstant,
  shortTime,
  nextUtcMidnight,
  timeOfInstant,
  toInstant,
  fromIso,
  monthShort,
  rangeLabel,
  relativeLabel,
  startOfWeek,
  toIso,
  weekDays,
} from './date'

describe('toIso / fromIso', () => {
  test('convierte una fecha local sin desfase de zona horaria', () => {
    expect(toIso(new Date(2026, 8, 11))).toBe('2026-09-11')
  })

  test('fromIso devuelve medianoche local, no UTC', () => {
    const date = fromIso('2026-09-11')
    expect(date.getFullYear()).toBe(2026)
    expect(date.getMonth()).toBe(8)
    expect(date.getDate()).toBe(11)
    expect(date.getHours()).toBe(0)
  })
})

describe('addDays', () => {
  test('cruza el cambio de mes', () => {
    expect(addDays('2026-09-30', 1)).toBe('2026-10-01')
  })

  test('acepta desplazamientos negativos', () => {
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31')
  })
})

describe('diffDays', () => {
  test('cuenta días entre dos fechas', () => {
    expect(diffDays('2026-09-11', '2026-09-14')).toBe(3)
    expect(diffDays('2026-09-14', '2026-09-11')).toBe(-3)
  })
})

describe('startOfWeek', () => {
  test('la semana empieza en lunes', () => {
    expect(startOfWeek('2026-09-11')).toBe('2026-09-07')
  })

  test('el domingo pertenece a la semana que ya empezó', () => {
    expect(startOfWeek('2026-09-13')).toBe('2026-09-07')
  })

  test('un lunes se devuelve a sí mismo', () => {
    expect(startOfWeek('2026-09-07')).toBe('2026-09-07')
  })
})

describe('weekDays', () => {
  test('devuelve siete días consecutivos desde el lunes', () => {
    const days = weekDays('2026-09-11')
    expect(days).toHaveLength(7)
    expect(days[0]).toBe('2026-09-07')
    expect(days[6]).toBe('2026-09-13')
  })
})

describe('relativeLabel', () => {
  test('nombra hoy, mañana y ayer', () => {
    expect(relativeLabel('2026-09-11', '2026-09-11')).toBe('Hoy')
    expect(relativeLabel('2026-09-12', '2026-09-11')).toBe('Mañana')
    expect(relativeLabel('2026-09-10', '2026-09-11')).toBe('Ayer')
  })

  test('para fechas lejanas usa día y mes', () => {
    expect(relativeLabel('2026-09-18', '2026-09-11')).toMatch(/18/)
  })
})

describe('rangeLabel', () => {
  test('omite el mes repetido dentro de la misma semana', () => {
    expect(rangeLabel('2026-09-07', '2026-09-13')).toBe(`7 – 13 ${monthShort('2026-09-13')}`)
  })

  test('muestra ambos meses cuando la semana los cruza', () => {
    const expected = `28 ${monthShort('2026-09-28')} – 4 ${monthShort('2026-10-04')}`
    expect(rangeLabel('2026-09-28', '2026-10-04')).toBe(expected)
  })
})

describe('horas', () => {
  test('isValidTime exige HH:MM de 24 h', () => {
    expect(isValidTime('09:30')).toBe(true)
    expect(isValidTime('23:59')).toBe(true)
    expect(isValidTime('9:30')).toBe(false)
    expect(isValidTime('24:00')).toBe(false)
    expect(isValidTime(930)).toBe(false)
  })

  test('toInstant e isoOfInstant/timeOfInstant son inversas en hora local', () => {
    const ms = toInstant('2026-09-11', '17:05')
    expect(new Date(ms).getHours()).toBe(17)
    expect(isoOfInstant(ms)).toBe('2026-09-11')
    expect(timeOfInstant(ms)).toBe('17:05')
  })

  test('nextUtcMidnight salta a las 00:00 UTC del día siguiente, también a fin de mes', () => {
    expect(nextUtcMidnight(Date.UTC(2026, 8, 15, 18, 30))).toBe(Date.UTC(2026, 8, 16))
    expect(nextUtcMidnight(Date.UTC(2026, 8, 30, 0, 0))).toBe(Date.UTC(2026, 9, 1))
  })

  test('formatTime rellena y shortTime quita el cero inicial', () => {
    expect(formatTime(9, 5)).toBe('09:05')
    expect(shortTime('09:05')).toBe('9:05')
    expect(shortTime('17:00')).toBe('17:00')
  })
})
