import { describe, expect, test } from 'vitest'
import { addLabel, composeTargets } from './compose'
import { dayNameShort } from './date'

const TODAY = '2026-09-30'
const TOMORROW = '2026-10-01'

describe('addLabel', () => {
  test('dice adónde va lo que se añade', () => {
    expect(addLabel(null, TODAY)).toBe('Añadir a la bandeja')
    expect(addLabel(TODAY, TODAY)).toBe('Añadir a hoy')
    expect(addLabel(TOMORROW, TODAY)).toBe('Añadir a mañana')
    expect(addLabel('2026-10-08', TODAY)).toBe('Añadir al jueves 8')
  })
})

describe('composeTargets', () => {
  test('en la Bandeja, sin fecha va primero', () => {
    expect(composeTargets(null, TODAY)).toEqual([
      { label: 'Sin fecha', date: null },
      { label: 'Hoy', date: TODAY },
      { label: 'Mañana', date: TOMORROW },
    ])
  })

  test('en la Agenda de hoy, hoy va primero y no se repite', () => {
    expect(composeTargets(TODAY, TODAY).map((target) => target.label)).toEqual(['Hoy', 'Mañana', 'Sin fecha'])
  })

  test('mirando mañana, mañana va primero', () => {
    expect(composeTargets(TOMORROW, TODAY).map((target) => target.label)).toEqual(['Mañana', 'Hoy', 'Sin fecha'])
  })

  test('otro día se nombra por su día de la semana y su número, delante de los de siempre', () => {
    const targets = composeTargets('2026-10-15', TODAY)
    const name = dayNameShort('2026-10-15')
    expect(targets[0]).toEqual({ label: `${name.charAt(0).toUpperCase()}${name.slice(1)} 15`, date: '2026-10-15' })
    expect(targets.slice(1).map((target) => target.date)).toEqual([TODAY, TOMORROW, null])
  })

  test('un día pasado también es un destino', () => {
    expect(composeTargets('2026-09-20', TODAY)).toHaveLength(4)
    expect(composeTargets('2026-09-20', TODAY)[0]!.date).toBe('2026-09-20')
  })
})
