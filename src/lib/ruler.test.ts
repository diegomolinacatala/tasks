import { describe, expect, test } from 'vitest'
import { MAX_DURATION } from './duration'
import { RULER_SPANS, durationAt, nextSpan, rulerTicks, spanFor, stepFor } from './ruler'

describe('spanFor', () => {
  test('sin duración, la regla corta: la de más precisión', () => {
    expect(spanFor(null)).toBe(RULER_SPANS[0])
  })

  test('el tramo más corto en que lo elegido queda holgado', () => {
    expect(spanFor(30)).toBe(120)
    expect(spanFor(90)).toBe(120)
    expect(spanFor(120)).toBe(240)
    expect(spanFor(180)).toBe(240)
    expect(spanFor(300)).toBe(480)
    expect(spanFor(600)).toBe(MAX_DURATION)
    expect(spanFor(MAX_DURATION)).toBe(MAX_DURATION)
  })
})

describe('nextSpan', () => {
  test('se estira al siguiente y no pasa del medio día', () => {
    expect(nextSpan(120)).toBe(240)
    expect(nextSpan(240)).toBe(480)
    expect(nextSpan(480)).toBe(MAX_DURATION)
    expect(nextSpan(MAX_DURATION)).toBe(MAX_DURATION)
  })
})

describe('stepFor', () => {
  test('cuanto más larga la regla, más grueso el paso', () => {
    expect(stepFor(120)).toBe(5)
    expect(stepFor(240)).toBe(15)
    expect(stepFor(480)).toBe(30)
    expect(stepFor(MAX_DURATION)).toBe(30)
  })
})

describe('durationAt', () => {
  test('al principio del todo (o antes), sin duración', () => {
    expect(durationAt(0, 120)).toBeNull()
    expect(durationAt(-0.4, 120)).toBeNull()
    expect(durationAt(0.01, 120)).toBeNull()
  })

  test('redondea al paso de la regla', () => {
    expect(durationAt(0.5, 120)).toBe(60)
    expect(durationAt(0.52, 120)).toBe(60)
    expect(durationAt(0.55, 120)).toBe(65)
    expect(durationAt(0.5, 240)).toBe(120)
    expect(durationAt(0.53, 240)).toBe(120)
    expect(durationAt(0.56, 240)).toBe(135)
  })

  test('al final (o más allá), lo que abarca la regla', () => {
    expect(durationAt(1, 120)).toBe(120)
    expect(durationAt(1.3, 240)).toBe(240)
    expect(durationAt(2, MAX_DURATION)).toBe(MAX_DURATION)
  })

  test('nunca menos de lo mínimo que dura algo', () => {
    expect(durationAt(0.035, 120)).toBe(5)
  })
})

describe('rulerTicks', () => {
  test('la de dos horas: cuartos, la hora más marcada y rótulos cada media hora', () => {
    const ticks = rulerTicks(120)
    expect(ticks.map((tick) => tick.minutes)).toEqual([15, 30, 45, 60, 75, 90, 105, 120])
    expect(ticks.filter((tick) => tick.major).map((tick) => tick.minutes)).toEqual([60, 120])
    expect(ticks.filter((tick) => tick.label).map((tick) => tick.label)).toEqual(['30 min', '1 h', '1 h 30', '2 h'])
  })

  test('la de medio día: una marca por hora y rótulos cada tres', () => {
    const ticks = rulerTicks(MAX_DURATION)
    expect(ticks).toHaveLength(12)
    expect(ticks.filter((tick) => tick.label).map((tick) => tick.label)).toEqual(['3 h', '6 h', '9 h', '12 h'])
  })
})
