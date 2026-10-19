import { afterEach, describe, expect, test } from 'vitest'
import type { Task } from '../types'
import { setLanguage } from './i18n'
import { SLOT_END, fillUntil, gapAround, slotBefore, slotIndexAt, slotOptions, steppedStart, suggestedStart, timeAt } from './slot'
import { timelineItems } from './timeline'

const task = (id: string, time: string, duration: number | null = null): Task => ({
  id,
  title: id,
  done: false,
  date: '2026-10-19',
  until: null,
  time,
  duration,
  reminders: [],
  sectionId: null,
  order: 0,
  importance: 1,
  createdAt: 0,
  completedAt: null,
})

// 9:00–10:00, 12:00–13:00 y una suelta a las 15:00.
const items = timelineItems([task('a', '09:00', 60), task('b', '12:00', 60), task('c', '15:00')], [])
const H = (hours: number, minutes = 0) => hours * 60 + minutes

afterEach(() => setLanguage('es'))

describe('gapAround', () => {
  test('entre dos: acaba la de delante, empieza la de detrás', () => {
    expect(gapAround(items, 1)).toEqual({ before: H(10), after: H(12) })
  })

  test('una larga con una corta dentro: el hueco empieza cuando acaba la larga', () => {
    const nested = timelineItems([task('larga', '09:00', 180), task('corta', '10:00', 30), task('tarde', '15:00')], [])
    expect(gapAround(nested, 2)).toEqual({ before: H(12), after: H(15) })
  })

  test('delante de todo y detrás de todo', () => {
    expect(gapAround(items, 0)).toEqual({ before: null, after: H(9) })
    // La última no dura: a estos efectos ocupa media hora.
    expect(gapAround(items, 3)).toEqual({ before: H(15, 30), after: null })
  })

  test('sin nada con hora', () => {
    expect(gapAround([], 0)).toEqual({ before: null, after: null })
  })
})

describe('slotBefore', () => {
  test('el id de lo que va detrás, o el final', () => {
    expect(slotBefore(items, 1)).toBe('b')
    expect(slotBefore(items, 3)).toBe(SLOT_END)
  })
})

describe('suggestedStart', () => {
  test('cuando acaba lo de delante', () => {
    expect(suggestedStart({ before: H(10), after: H(12) }, null)).toBe(H(10))
  })

  test('sin nada delante, una hora antes de lo de detrás', () => {
    expect(suggestedStart({ before: null, after: H(12) }, null)).toBe(H(11))
    expect(suggestedStart({ before: null, after: H(0, 30) }, null)).toBe(0)
  })

  test('sin nada: a las 9 otro día; hoy, ahora al cuarto de hora siguiente', () => {
    expect(suggestedStart({ before: null, after: null }, null)).toBe(H(9))
    expect(suggestedStart({ before: null, after: null }, H(10, 37))).toBe(H(10, 45))
    expect(suggestedStart({ before: null, after: null }, H(10, 45))).toBe(H(10, 45))
  })

  test('hoy no propone nada que ya pasó', () => {
    expect(suggestedStart({ before: H(10), after: H(12) }, H(10, 50))).toBe(H(11))
    // Lo de delante acaba en el futuro: se respeta.
    expect(suggestedStart({ before: H(10), after: H(12) }, H(9, 50))).toBe(H(10))
  })

  test('un hueco que quedó entero en el pasado se queda con su hora', () => {
    expect(suggestedStart({ before: H(9, 30), after: H(10) }, H(11, 36))).toBe(H(9, 30))
  })

  test('no se sale del día', () => {
    expect(suggestedStart({ before: H(23, 58), after: null }, null)).toBe(H(23, 55))
  })
})

describe('steppedStart', () => {
  test('cuartos de hora, dentro del día', () => {
    expect(steppedStart(H(10), 1)).toBe(H(10, 15))
    expect(steppedStart(H(10), -2)).toBe(H(9, 30))
    expect(steppedStart(H(0, 5), -1)).toBe(0)
    expect(steppedStart(H(23, 50), 1)).toBe(H(23, 55))
  })
})

describe('slotOptions', () => {
  test('ninguna, las de siempre y hasta lo siguiente', () => {
    const labels = slotOptions(H(10), { before: H(10), after: H(12) }).map((option) => `${option.minutes}:${option.label}`)
    expect(labels).toEqual(['null:Sin duración', '15:15 min', '30:30 min', '60:1 h', '120:2 h'])
    // Hasta las 12 son 2 h: ya está. Desde las 10:30, hasta las 12 es 1 h 30.
    expect(slotOptions(H(10, 30), { before: H(10), after: H(12) }).at(-1)).toEqual({ minutes: 90, label: 'Hasta las 12:00', until: true })
    expect(fillUntil(H(10, 30), { before: H(10), after: H(12) })).toBe(90)
  })

  test('sin nada detrás, o demasiado cerca, no hay "hasta"', () => {
    expect(slotOptions(H(10), { before: null, after: null })).toHaveLength(5)
    expect(slotOptions(H(11, 58), { before: null, after: H(12) })).toHaveLength(5)
    expect(slotOptions(H(12), { before: null, after: H(11) })).toHaveLength(5)
    expect(fillUntil(H(12), { before: null, after: H(11) })).toBeNull()
  })

  test('la duración que ya tenía la tarea se ofrece en su sitio, y nada cruza la medianoche', () => {
    expect(slotOptions(H(10), { before: null, after: null }, 45).map((option) => option.minutes)).toEqual([null, 15, 30, 45, 60, 120])
    expect(slotOptions(H(10), { before: null, after: null }, 60).map((option) => option.minutes)).toEqual([null, 15, 30, 60, 120])
    expect(slotOptions(H(23, 30), { before: null, after: null }, 90).map((option) => option.minutes)).toEqual([null, 15, 30])
  })

  test('en inglés', () => {
    setLanguage('en')
    const options = slotOptions(H(10, 30), { before: null, after: H(12) })
    expect(options[0]?.label).toBe('No duration')
    expect(options.at(-1)?.label).toBe('Until 12:00 PM')
  })
})

describe('slotIndexAt', () => {
  const rows = [
    { top: 100, bottom: 150 },
    { top: 150, bottom: 250 },
    { top: 250, bottom: 300 },
  ]

  test('delante de la primera fila cuya mitad queda por debajo', () => {
    expect(slotIndexAt(50, rows)).toBe(0)
    expect(slotIndexAt(124, rows)).toBe(0)
    expect(slotIndexAt(126, rows)).toBe(1)
    expect(slotIndexAt(210, rows)).toBe(2)
    expect(slotIndexAt(400, rows)).toBe(3)
    expect(slotIndexAt(10, [])).toBe(0)
  })
})

describe('timeAt', () => {
  test('minutos a HH:MM', () => {
    expect(timeAt(H(9, 5))).toBe('09:05')
    expect(timeAt(H(23, 55))).toBe('23:55')
  })
})
