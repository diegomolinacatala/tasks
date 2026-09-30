import { describe, expect, test } from 'vitest'
import type { Routine, Task } from '../types'
import { buildTimeline, clockOf, freeLabel, timelineItems } from './timeline'

const task = (id: string, time: string | null, duration: number | null = null): Task => ({
  id,
  title: id,
  done: false,
  date: '2026-09-29',
  time,
  duration,
  reminders: [],
  sectionId: null,
  order: 0,
  importance: 1,
  createdAt: 0,
  completedAt: null,
})

const routine = (id: string, time: string | null): Routine => ({ id, title: id, emoji: null, days: [1, 2, 3, 4, 5, 6, 7], time, done: [], order: 0, createdAt: 0 })

const kinds = (rows: ReturnType<typeof buildTimeline>) => rows.map((row) => (row.kind === 'gap' ? `gap ${row.minutes}` : row.kind === 'now' ? 'now' : row.id))

describe('timelineItems', () => {
  test('solo lo que tiene hora, en orden, con tareas y rutinas', () => {
    const items = timelineItems([task('tarde', '17:00', 60), task('suelta', null), task('manana', '09:00')], [routine('creatina', '10:00'), routine('agua', null)])
    expect(items.map((item) => item.id)).toEqual(['manana', 'routine:creatina', 'tarde'])
    expect(items[2]).toMatchObject({ start: 17 * 60, end: 18 * 60 })
  })
})

describe('buildTimeline', () => {
  const items = timelineItems([task('a', '09:00', 60), task('b', '10:15', 30), task('c', '13:00')], [])

  test('dice el tiempo libre si el hueco es largo', () => {
    // a acaba a las 10:00: 15 min hasta b no cuentan; de 10:45 a 13:00 son 135.
    expect(kinds(buildTimeline(items, null))).toEqual(['a', 'b', 'gap 135', 'c'])
  })

  test('ahora cae entre lo que ya pasó y lo que viene; el hueco se mide desde ahora', () => {
    expect(kinds(buildTimeline(items, 12 * 60))).toEqual(['a', 'b', 'now', 'gap 60', 'c'])
  })

  test('si lo que queda de hueco es corto, no se dice', () => {
    expect(kinds(buildTimeline(items, 12 * 60 + 30))).toEqual(['a', 'b', 'now', 'c'])
  })

  test('ahora antes de todo: dice lo que queda libre hasta lo primero', () => {
    expect(kinds(buildTimeline(items, 7 * 60))).toEqual(['now', 'gap 120', 'a', 'b', 'gap 135', 'c'])
  })

  test('después de todo, ahora va al final', () => {
    expect(kinds(buildTimeline(items, 20 * 60)).at(-1)).toBe('now')
  })

  test('lo que está en curso lleva su avance y no hay marca de ahora', () => {
    const rows = buildTimeline(items, 9 * 60 + 15)
    expect(kinds(rows)).not.toContain('now')
    expect(rows[0]).toMatchObject({ id: 'a', live: 0.25 })
  })

  test('sin nada con hora no hay filas', () => {
    expect(buildTimeline([], 600)).toEqual([])
  })
})

test('freeLabel', () => {
  expect(freeLabel(45)).toBe('45 min libres')
  expect(freeLabel(60)).toBe('1 h libre')
  expect(freeLabel(90)).toBe('1 h 30 libres')
})

test('clockOf', () => {
  expect(clockOf(9 * 60 + 5)).toBe('9:05')
  expect(clockOf(0)).toBe('0:00')
})
