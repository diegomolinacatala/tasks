import { describe, expect, test } from 'vitest'
import type { Routine, Task } from '../types'
import type { TimelineCluster } from './timeline'
import { MAX_LANES, buildTimeline, clockOf, freeLabel, groupParallel, timelineItems } from './timeline'

const task = (id: string, time: string | null, duration: number | null = null): Task => ({
  id,
  title: id,
  done: false,
  date: '2026-09-29',
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

const routine = (id: string, time: string | null): Routine => ({ id, title: id, emoji: null, days: [1, 2, 3, 4, 5, 6, 7], time, done: [], order: 0, createdAt: 0 })

const kinds = (rows: ReturnType<typeof buildTimeline>) => rows.map((row) => (row.kind === 'gap' ? `gap ${row.minutes}` : row.kind === 'now' ? 'now' : row.id))
const lanesOf = (unit: unknown) => (unit as TimelineCluster).lanes.map((lane) => lane.map((item) => item.id))

describe('timelineItems', () => {
  test('solo lo que tiene hora, en orden, con tareas y rutinas', () => {
    const items = timelineItems([task('tarde', '17:00', 60), task('suelta', null), task('manana', '09:00')], [routine('creatina', '10:00'), routine('agua', null)])
    expect(items.map((item) => item.id)).toEqual(['manana', 'routine:creatina', 'tarde'])
    expect(items[2]).toMatchObject({ start: 17 * 60, end: 18 * 60 })
  })
})

describe('groupParallel', () => {
  test('lo que se solapa va junto, en carriles', () => {
    const units = groupParallel(timelineItems([task('a', '09:00', 60), task('b', '09:30', 60), task('c', '11:00')], []))
    expect(units.map((unit) => unit.kind)).toEqual(['cluster', 'task'])
    expect(units[0]).toMatchObject({ id: 'cluster:a', start: 9 * 60, end: 10 * 60 + 30 })
    expect(lanesOf(units[0])).toEqual([['a'], ['b']])
  })

  test('lo que acaba justo cuando empieza otra cosa no se solapa', () => {
    const units = groupParallel(timelineItems([task('a', '09:00', 60), task('b', '10:00', 60)], []))
    expect(units.map((unit) => unit.kind)).toEqual(['task', 'task'])
  })

  test('dos cosas a la misma hora, aunque no duren, coinciden; una suelta dentro de algo largo, también', () => {
    expect(groupParallel(timelineItems([task('a', '09:00'), task('b', '09:00')], [])).map((unit) => unit.kind)).toEqual(['cluster'])
    const inside = groupParallel(timelineItems([task('larga', '09:00', 180)], [routine('creatina', '10:00')]))
    expect(lanesOf(inside[0])).toEqual([['larga'], ['routine:creatina']])
  })

  test('en cadena: el carril que se libera se vuelve a usar', () => {
    const units = groupParallel(timelineItems([task('a', '09:00', 60), task('b', '09:30', 60), task('c', '10:15', 45)], []))
    expect(units).toHaveLength(1)
    expect(lanesOf(units[0])).toEqual([['a', 'c'], ['b']])
  })

  test(`como mucho ${MAX_LANES} carriles: lo que no cabe va debajo en el que antes se libera`, () => {
    const units = groupParallel(timelineItems([task('a', '09:00', 180), task('b', '09:00', 60), task('c', '09:30', 30)], []))
    // En orden: b (acaba antes) va primero; c, en el carril que se libera a las 10.
    expect(lanesOf(units[0])).toEqual([['b', 'c'], ['a']])
  })

  test('no toca lo que recibe', () => {
    const items = timelineItems([task('a', '09:00', 60), task('b', '09:30', 60)], [])
    const copy = structuredClone(items)
    groupParallel(items)
    expect(items).toEqual(copy)
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

  test('lo que coincide es una fila; el hueco se mide desde que acaba lo último de ella', () => {
    const parallel = timelineItems([task('a', '09:00', 60), task('b', '09:30', 90), task('c', '13:00')], [])
    const rows = buildTimeline(parallel, null)
    expect(kinds(rows)).toEqual(['cluster:a', 'gap 120', 'c'])
    expect(rows[1]).toMatchObject({ start: 11 * 60, end: 13 * 60 })
  })

  test('en curso dentro de algo en paralelo: lleva su avance y no hay marca de ahora', () => {
    const parallel = timelineItems([task('a', '09:00', 60), task('b', '09:30', 90)], [])
    const [row] = buildTimeline(parallel, 9 * 60 + 45)
    expect((row as TimelineCluster).lanes[0]![0]).toMatchObject({ id: 'a', live: 0.75 })
  })

  test('sin nada con hora no hay filas', () => {
    expect(buildTimeline([], 600)).toEqual([])
  })
})

test('freeLabel', () => {
  expect(freeLabel(45)).toBe('45 min libres')
  expect(freeLabel(60)).toBe('1 h libre')
  expect(freeLabel(90)).toBe('1 h 30 min libres')
})

test('clockOf', () => {
  expect(clockOf(9 * 60 + 5)).toBe('9:05')
  expect(clockOf(0)).toBe('0:00')
})
