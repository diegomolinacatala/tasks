import { describe, expect, test } from 'vitest'
import { DEFAULT_IMPORTANCE } from '../lib/importance'
import { seedState } from './seed'

const MORNING = new Date(2026, 8, 29, 9, 20)
const NIGHT = new Date(2026, 8, 29, 22, 40)

describe('seedState', () => {
  test('por la mañana: una con hora para el horario, cuatro de hoy sin hora y una en la bandeja', () => {
    const { tasks } = seedState(MORNING)
    expect(tasks).toHaveLength(6)
    expect(tasks[0]).toMatchObject({ date: '2026-09-29', time: '10:00', duration: 60 })
    expect(tasks.filter((task) => task.date === '2026-09-29' && task.time === null)).toHaveLength(4)
    expect(tasks.filter((task) => task.date === null)).toHaveLength(1)
    expect(tasks.every((task) => !task.done && task.reminders.length === 0)).toBe(true)
  })

  test('de noche, sin hora que quepa en el día, no hay tarea para el horario', () => {
    const { tasks } = seedState(NIGHT)
    expect(tasks).toHaveLength(5)
    expect(tasks.every((task) => task.time === null)).toBe(true)
  })

  test('la que explica la importancia ya viene grande; el resto, normales', () => {
    const tasks = seedState(MORNING).tasks
    const big = tasks.filter((task) => task.importance > DEFAULT_IMPORTANCE)
    expect(big).toHaveLength(1)
    expect(big[0]!.title).toMatch(/importante/)
  })

  test('los ids son únicos y empieza sin rutinas', () => {
    const state = seedState(MORNING)
    expect(new Set(state.tasks.map((task) => task.id)).size).toBe(state.tasks.length)
    expect(state.routines).toEqual([])
  })
})
