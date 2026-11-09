import { afterEach, describe, expect, test } from 'vitest'
import type { Task } from '../types'
import { setLanguage } from './i18n'
import { TAPE_LAST, TAPE_PX_PER_HOUR, TAPE_WIDTH, busySpans, minutesAtOffset, tapeOffset, tapeTicks } from './tape'
import { timelineItems } from './timeline'

const H = (hours: number, minutes = 0) => hours * 60 + minutes

const task = (id: string, time: string, duration: number | null = null): Task => ({
  id,
  title: id,
  done: false,
  date: '2026-10-20',
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

afterEach(() => setLanguage('es'))

describe('tapeOffset y minutesAtOffset', () => {
  test('48 px por hora, ida y vuelta al cuarto de hora', () => {
    expect(tapeOffset(H(9))).toBe(9 * TAPE_PX_PER_HOUR)
    expect(TAPE_WIDTH).toBe(24 * TAPE_PX_PER_HOUR)
    expect(minutesAtOffset(tapeOffset(H(9, 15)))).toBe(H(9, 15))
    // 9:09 va a las 9:15; 9:07, a las 9:00.
    expect(minutesAtOffset(tapeOffset(H(9, 9)))).toBe(H(9, 15))
    expect(minutesAtOffset(tapeOffset(H(9, 7)))).toBe(H(9))
  })

  test('sin salirse del día', () => {
    expect(minutesAtOffset(-100)).toBe(0)
    expect(minutesAtOffset(10_000)).toBe(TAPE_LAST)
  })
})

describe('busySpans', () => {
  const items = timelineItems([task('a', '09:00', 60), task('b', '09:30', 90), task('c', '12:00'), task('d', '15:00', 30)], [])

  test('funde lo que se solapa y lo suelto ocupa media hora', () => {
    expect(busySpans(items)).toEqual([
      { start: H(9), end: H(11) },
      { start: H(12), end: H(12, 30) },
      { start: H(15), end: H(15, 30) },
    ])
  })

  test('sin lo que se está colocando', () => {
    expect(busySpans(items, 'b')).toEqual([
      { start: H(9), end: H(10) },
      { start: H(12), end: H(12, 30) },
      { start: H(15), end: H(15, 30) },
    ])
  })

  test('nada cruza la medianoche', () => {
    expect(busySpans(timelineItems([task('z', '23:45', 60)], []))).toEqual([{ start: H(23, 45), end: H(24) }])
  })
})

describe('tapeTicks', () => {
  test('un cuarto de hora por marca; las horas, con su cifra', () => {
    const ticks = tapeTicks()
    expect(ticks).toHaveLength(96)
    expect(ticks[0]).toEqual({ minutes: 0, major: true, label: '0' })
    expect(ticks[1]).toEqual({ minutes: 15, major: false, label: null })
    expect(ticks[36]).toEqual({ minutes: H(9), major: true, label: '9' })
  })

  test('en inglés, cada dos horas con AM y PM', () => {
    setLanguage('en')
    const ticks = tapeTicks()
    expect(ticks[32]?.label).toBe('8 AM')
    expect(ticks[36]?.label).toBeNull()
    expect(ticks[48]?.label).toBe('12 PM')
    expect(ticks[0]?.label).toBe('12 AM')
  })
})
