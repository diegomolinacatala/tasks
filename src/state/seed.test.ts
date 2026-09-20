import { describe, expect, test } from 'vitest'
import { todayIso } from '../lib/date'
import { DEFAULT_IMPORTANCE } from '../lib/importance'
import { seedState } from './seed'

describe('seedState', () => {
  test('crea tareas de ejemplo para hoy, ordenadas y sin completar', () => {
    const state = seedState()
    expect(state.tasks).toHaveLength(4)
    expect(state.tasks.every((task) => task.date === todayIso())).toBe(true)
    expect(state.tasks.every((task) => !task.done)).toBe(true)
    expect(state.tasks.map((task) => task.order)).toEqual([0, 1, 2, 3])
  })

  test('la que explica la importancia ya viene grande; el resto, normales', () => {
    const importances = seedState().tasks.map((task) => task.importance)
    expect(importances.slice(0, 3).every((value) => value === DEFAULT_IMPORTANCE)).toBe(true)
    expect(importances[3]).toBeGreaterThan(DEFAULT_IMPORTANCE)
  })

  test('los ids son únicos', () => {
    const ids = new Set(seedState().tasks.map((task) => task.id))
    expect(ids.size).toBe(4)
  })
})
