import { describe, expect, test } from 'vitest'
import { todayIso } from '../lib/date'
import { seedState } from './seed'

describe('seedState', () => {
  test('crea tareas de ejemplo para hoy, ordenadas y sin completar', () => {
    const state = seedState()
    expect(state.tasks).toHaveLength(3)
    expect(state.tasks.every((task) => task.date === todayIso())).toBe(true)
    expect(state.tasks.every((task) => !task.done)).toBe(true)
    expect(state.tasks.map((task) => task.order)).toEqual([0, 1, 2])
  })

  test('los ids son únicos', () => {
    const ids = new Set(seedState().tasks.map((task) => task.id))
    expect(ids.size).toBe(3)
  })
})
