import { describe, expect, test } from 'vitest'
import type { Task } from '../types'
import { DEFAULT_EVENT_MINUTES, MAX_EXPORT, exportItems } from './calendarExport'
import { addDays, toInstant } from './date'

const TODAY = '2026-10-10'
const NOW = toInstant(TODAY, '10:00')

const task = (partial: Partial<Task> & { id: string }): Task => ({
  title: partial.id,
  done: false,
  date: TODAY,
  until: null,
  time: '17:00',
  duration: null,
  reminders: [],
  sectionId: null,
  order: 0,
  importance: 1,
  createdAt: 0,
  completedAt: null,
  ...partial,
})

describe('exportItems', () => {
  test('lo pendiente con día y hora, con su duración', () => {
    expect(exportItems([task({ id: 'reunion', title: 'Reunión', duration: 90 })], NOW)).toEqual([
      { taskId: 'reunion', title: 'Reunión', start: toInstant(TODAY, '17:00'), end: toInstant(TODAY, '18:30') },
    ])
  })

  test('sin duración, media hora', () => {
    const [item] = exportItems([task({ id: 'llamar' })], NOW)
    expect(item!.end - item!.start).toBe(DEFAULT_EVENT_MINUTES * 60_000)
  })

  test('lo tachado, lo que no tiene hora y lo que no tiene día no van', () => {
    const tasks = [task({ id: 'hecha', done: true }), task({ id: 'sin-hora', time: null }), task({ id: 'bandeja', date: null })]
    expect(exportItems(tasks, NOW)).toEqual([])
  })

  test('una con plazo va en el día en que se ve (hoy) y lo atrasado sigue un tiempo', () => {
    const items = exportItems(
      [
        task({ id: 'plazo', date: addDays(TODAY, -2), until: addDays(TODAY, 3), time: '09:00' }),
        task({ id: 'ayer', date: addDays(TODAY, -1) }),
        task({ id: 'antigua', date: addDays(TODAY, -90) }),
      ],
      NOW,
    )
    expect(items.map((item) => item.taskId)).toEqual(['ayer', 'plazo'])
    expect(items[1]!.start).toBe(toInstant(TODAY, '09:00'))
  })

  test('en orden y con tope, quedándose con lo más cercano y lo que viene', () => {
    const many = Array.from({ length: MAX_EXPORT + 3 }, (_, index) => task({ id: `t${index}`, date: addDays(TODAY, index - 3) }))
    const items = exportItems(many, NOW)
    expect(items).toHaveLength(MAX_EXPORT)
    expect(items[0]!.taskId).toBe('t3')
  })
})
