import { afterEach, describe, expect, test } from 'vitest'
import type { Task } from '../types'
import { setLanguage } from './i18n'
import { STEP_PX, fillUntil, gapAt, slotOptions, slotPoint, steppedStart, suggestedStart, timeAt } from './slot'
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

describe('gapAt', () => {
  test('hasta dónde llega lo de antes y cuándo empieza lo siguiente', () => {
    expect(gapAt(items, H(10, 30))).toEqual({ before: H(10), after: H(12) })
    // A la vez que algo: cuenta como de antes.
    expect(gapAt(items, H(12))).toEqual({ before: H(13), after: H(15) })
  })

  test('delante de todo y detrás de todo', () => {
    expect(gapAt(items, H(8))).toEqual({ before: null, after: H(9) })
    // La última no dura: a estos efectos ocupa media hora.
    expect(gapAt(items, H(16))).toEqual({ before: H(15, 30), after: null })
  })

  test('sin nada con hora', () => {
    expect(gapAt([], H(10))).toEqual({ before: null, after: null })
  })
})

describe('slotPoint', () => {
  // Una fila de 9 a 10 (64 px), el hueco libre de 10 a 12 (34 px), otra de 12 a 13 (64 px).
  const anchors = [
    { y: 0, minutes: H(9) },
    { y: 64, minutes: H(10) },
    { y: 98, minutes: H(12) },
    { y: 162, minutes: H(13) },
  ]

  test('dentro de una fila, su hora repartida a lo alto, al cuarto de hora', () => {
    expect(slotPoint(32, anchors)).toEqual({ minutes: H(9, 30), y: 32 })
    // 9:09 va a las 9:15, y la marca se pinta a la altura de las 9:15 (salta, no sigue al dedo).
    expect(slotPoint(10, anchors)).toEqual({ minutes: H(9, 15), y: 16 })
  })

  test('un hueco con más horas de las que caben: justo después arriba, justo antes abajo', () => {
    expect(slotPoint(70, anchors)).toEqual({ minutes: H(10, 15), y: 64 + STEP_PX })
    expect(slotPoint(90, anchors)).toEqual({ minutes: H(11, 45), y: 90 })
    expect(slotPoint(97, anchors)).toEqual({ minutes: H(12), y: 98 })
  })

  test('por encima de lo primero y por debajo de lo último, a un cuarto por paso', () => {
    expect(slotPoint(-2 * STEP_PX, anchors)).toEqual({ minutes: H(8, 30), y: -2 * STEP_PX })
    expect(slotPoint(162 + 3 * STEP_PX, anchors)).toEqual({ minutes: H(13, 45), y: 162 + 3 * STEP_PX })
  })

  test('sin salirse del día', () => {
    expect(slotPoint(1000, [{ y: 0, minutes: H(23, 30) }])?.minutes).toBe(H(23, 45))
    expect(slotPoint(-1000, [{ y: 0, minutes: H(0, 30) }])?.minutes).toBe(0)
  })

  test('lo de antes de que empiece un trozo no cuenta: el primer cuarto de hora tras las 10:10 es las 10:15', () => {
    const odd = [
      { y: 0, minutes: H(10, 10) },
      { y: 64, minutes: H(11, 40) },
    ]
    expect(slotPoint(0, odd)?.minutes).toBe(H(10, 15))
    expect(slotPoint(10, odd)?.minutes).toBe(H(10, 30))
  })

  test('en la marca de ahora (un trozo sin cuarto de hora dentro), el siguiente cuarto: nunca uno ya pasado', () => {
    const today = [
      { y: 0, minutes: H(9) },
      { y: 100, minutes: H(11, 22) },
      { y: 126, minutes: H(11, 22) },
      { y: 160, minutes: H(14) },
    ]
    expect(slotPoint(110, today)?.minutes).toBe(H(11, 30))
  })

  test('las horas no bajan al bajar el dedo', () => {
    const nested = [
      { y: 0, minutes: H(10) },
      { y: 50, minutes: H(9, 30) },
      { y: 100, minutes: H(11) },
    ]
    expect(slotPoint(25, nested)?.minutes).toBe(H(10))
    expect(slotPoint(75, nested)?.minutes).toBe(H(10, 30))
  })

  test('sin filas, nada', () => {
    expect(slotPoint(10, [])).toBeNull()
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

describe('timeAt', () => {
  test('minutos a HH:MM', () => {
    expect(timeAt(H(9, 5))).toBe('09:05')
    expect(timeAt(H(23, 55))).toBe('23:55')
  })
})
