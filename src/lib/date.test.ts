import { describe, expect, test } from 'vitest'
import {
  MONTH_WEEKS,
  addDays,
  addMonths,
  monthWeeks,
  sameMonth,
  startOfMonth,
  diffDays,
  formatTime,
  isValidTime,
  isoOfInstant,
  shortTime,
  nextUtcMidnight,
  timeOfInstant,
  toInstant,
  fromIso,
  monthLong,
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

describe('meses', () => {
  test('startOfMonth y sameMonth', () => {
    expect(startOfMonth('2026-09-30')).toBe('2026-09-01')
    expect(sameMonth('2026-09-01', '2026-09-30')).toBe(true)
    expect(sameMonth('2026-09-30', '2026-10-01')).toBe(false)
    expect(sameMonth('2025-09-30', '2026-09-30')).toBe(false)
  })

  test('addMonths conserva el día y cruza el año', () => {
    expect(addMonths('2026-09-15', 2)).toBe('2026-11-15')
    expect(addMonths('2026-11-15', 2)).toBe('2027-01-15')
    expect(addMonths('2026-01-15', -1)).toBe('2025-12-15')
  })

  test('addMonths se queda en el último día si el mes es más corto', () => {
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28')
    expect(addMonths('2028-01-31', 1)).toBe('2028-02-29')
    expect(addMonths('2026-10-31', -1)).toBe('2026-09-30')
  })

  test('monthWeeks da seis lunes seguidos desde la semana del día 1', () => {
    // Septiembre de 2026 empieza en martes: su primera semana arranca el lunes 31 de agosto.
    expect(monthWeeks('2026-09-30')).toEqual(['2026-08-31', '2026-09-07', '2026-09-14', '2026-09-21', '2026-09-28', '2026-10-05'])
    expect(monthWeeks('2026-09-30')).toHaveLength(MONTH_WEEKS)
  })

  test('un mes que empieza en lunes no enseña la semana anterior', () => {
    expect(monthWeeks('2026-06-18')[0]).toBe('2026-06-01')
  })

  test('el mes entero cabe siempre en sus seis semanas', () => {
    for (const month of ['2026-02-10', '2026-03-10', '2026-08-10', '2027-05-10']) {
      const weeks = monthWeeks(month)
      const last = addDays(weeks[weeks.length - 1]!, 6)
      expect(weeks[0]! <= startOfMonth(month)).toBe(true)
      expect(last >= addDays(addMonths(startOfMonth(month), 1), -1)).toBe(true)
    }
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

describe('monthLong', () => {
  test('el mes entero y en minúscula, como se escribe en una fecha', () => {
    expect(monthLong('2026-09-28')).toBe('septiembre')
    expect(monthLong('2026-01-01')).toBe('enero')
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
