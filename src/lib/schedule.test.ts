import { describe, expect, test } from 'vitest'
import type { AppState, Task } from '../types'
import { toInstant } from './date'
import { DIGEST_DAYS, badgeCount, digestEntries, notificationBody, upcomingSchedule } from './schedule'

const TODAY = '2026-09-11'
const NOW = toInstant(TODAY, '10:00')
const MINUTE = 60_000

const task = (partial: Partial<Task> & { id: string }): Task => ({
  title: partial.id,
  done: false,
  date: TODAY,
  time: null,
  reminders: [],
  sectionId: null,
  order: 0,
  createdAt: 0,
  completedAt: null,
  ...partial,
})

const stateOf = (tasks: Task[], digest = { enabled: false, time: '08:30' }): AppState => ({
  schemaVersion: 4,
  tasks,
  sections: [{ id: 's1', name: 'Trabajo', order: 0, collapsed: false }],
  places: [],
  collapsed: { overdue: false, backlog: false },
  settings: { digest },
})

describe('notificationBody', () => {
  const at = (time: string, date = TODAY) => toInstant(date, time)

  test('con hora: ahora, en unos minutos, más tarde hoy u otro día', () => {
    const t = task({ id: 'a', time: '17:00' })
    expect(notificationBody(t, at('17:00'), [])).toBe('Ahora · 17:00')
    expect(notificationBody(t, at('16:50'), [])).toBe('En 10 min · 17:00')
    expect(notificationBody(t, at('09:00'), [])).toBe('Hoy a las 17:00')
    expect(notificationBody(t, at('17:00', '2026-09-10'), [])).toBe('Mañana a las 17:00')
  })

  test('pospuesta después de su hora', () => {
    const t = task({ id: 'a', time: '17:00' })
    expect(notificationBody(t, at('17:10'), [])).toBe('Era a las 17:00')
    expect(notificationBody(t, at('09:00', '2026-09-12'), [])).toBe('Pendiente desde ayer')
  })

  test('sin hora: para hoy, para otro día, atrasada o sin fecha', () => {
    expect(notificationBody(task({ id: 'a' }), NOW, [])).toBe('Para hoy')
    expect(notificationBody(task({ id: 'a', date: '2026-09-12' }), NOW, [])).toBe('Para mañana')
    expect(notificationBody(task({ id: 'a', date: '2026-09-05' }), NOW, [])).toMatch(/^Pendiente desde el 5 /)
    expect(notificationBody(task({ id: 'a', date: null }), NOW, [])).toBe('Sin fecha')
  })

  test('añade la sección', () => {
    const sections = stateOf([]).sections
    expect(notificationBody(task({ id: 'a', sectionId: 's1' }), NOW, sections)).toBe('Para hoy · Trabajo')
  })
})

describe('upcomingSchedule', () => {
  test('ordena, excluye completadas, pasadas e inactivas', () => {
    const state = stateOf([
      task({ id: 'a', title: 'Llamar', time: '12:00', reminders: [{ id: 'a1', kind: 'before', minutes: 0 }] }),
      task({ id: 'b', reminders: [{ id: 'b1', kind: 'at', at: NOW + MINUTE }, { id: 'b2', kind: 'at', at: NOW - 1 }] }),
      task({ id: 'c', done: true, reminders: [{ id: 'c1', kind: 'at', at: NOW + MINUTE }] }),
      task({ id: 'd', date: null, reminders: [{ id: 'd1', kind: 'before', minutes: 0 }] }),
    ])
    const schedule = upcomingSchedule(state, NOW)
    expect(schedule.map((entry) => entry.id)).toEqual(['b1', 'a1'])
    expect(schedule[1]).toMatchObject({ taskId: 'a', title: 'Llamar', body: 'Ahora · 12:00' })
    expect(schedule[0]!.body).toBe('Para hoy')
  })

  test('recorta al máximo indicado', () => {
    const reminders = Array.from({ length: 5 }, (_, i) => ({ id: `r${i}`, kind: 'at' as const, at: NOW + (i + 1) * MINUTE }))
    expect(upcomingSchedule(stateOf([task({ id: 'a', reminders })]), NOW, 3)).toHaveLength(3)
  })

  test('el badge cuenta lo pendiente con fecha hasta el día del aviso', () => {
    const tomorrowAt = toInstant('2026-09-12', '09:00')
    const state = stateOf([
      task({ id: 'hoy' }),
      task({ id: 'atrasada', date: '2026-09-01' }),
      task({ id: 'manana', date: '2026-09-12', reminders: [{ id: 'm1', kind: 'at', at: tomorrowAt }] }),
      task({ id: 'sin', date: null }),
      task({ id: 'hecha', done: true }),
    ])
    expect(badgeCount(state.tasks, NOW)).toBe(2)
    expect(upcomingSchedule(state, NOW)[0]!.badge).toBe(3)
  })

  test('mezcla resumen diario y recordatorios por orden de hora', () => {
    const state = stateOf(
      [task({ id: 'm', date: '2026-09-12', reminders: [{ id: 'r', kind: 'at', at: toInstant('2026-09-12', '07:00') }] })],
      { enabled: true, time: '08:30' },
    )
    expect(upcomingSchedule(state, NOW).map((entry) => entry.id).slice(0, 3)).toEqual(['r', 'digest-20260912', 'digest-20260913'])
  })
})

describe('digestEntries', () => {
  const enabled = { enabled: true, time: '08:30' }

  test('desactivado no programa nada', () => {
    expect(digestEntries(stateOf([task({ id: 'a' })]), NOW)).toEqual([])
  })

  test('uno por día con tareas, desde mañana si la hora de hoy ya pasó', () => {
    const state = stateOf(
      [
        task({ id: 'b', title: 'Pan', date: '2026-09-12', order: 1 }),
        task({ id: 'a', title: 'Llamar', date: '2026-09-12', time: '17:00', order: 2 }),
        task({ id: 'c', title: 'Luz', date: '2026-09-12', order: 0 }),
        task({ id: 'd', title: 'Gym', date: '2026-09-12', order: 3 }),
        task({ id: 'x', date: '2026-09-12', done: true }),
      ],
      enabled,
    )
    const entries = digestEntries(state, NOW)
    // Mañana es el primero; los días siguientes esas tareas ya contarían como atrasadas.
    expect(entries.map((entry) => entry.id)).toEqual(['12', '13', '14', '15', '16', '17'].map((d) => `digest-202609${d}`))
    expect(entries[0]).toEqual({
      id: 'digest-20260912',
      taskId: null,
      at: toInstant('2026-09-12', '08:30'),
      title: '4 tareas para hoy',
      body: '17:00 Llamar · Luz · Pan · +1',
    })
  })

  test('cuenta lo que para ese día estará atrasado', () => {
    const state = stateOf([task({ id: 'hoy', date: TODAY }), task({ id: 'm', date: '2026-09-13' })], enabled)
    const [tomorrow, dayAfter] = digestEntries(state, NOW)
    expect(tomorrow).toMatchObject({ title: 'Nada nuevo para hoy · 1 atrasada', body: '' })
    expect(dayAfter).toMatchObject({ title: '1 tarea para hoy · 1 atrasada', body: 'm' })
  })

  test('no pasa de una semana', () => {
    const tasks = Array.from({ length: 10 }, (_, i) => task({ id: `t${i}`, date: `2026-09-${String(12 + i).padStart(2, '0')}` }))
    expect(digestEntries(stateOf(tasks, { enabled: true, time: '23:00' }), NOW).length).toBeLessThanOrEqual(DIGEST_DAYS)
  })
})
