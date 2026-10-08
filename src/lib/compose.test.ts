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
      { key: 'none', label: 'Sin fecha', date: null },
      { key: TODAY, label: 'Hoy', date: TODAY },
      { key: TOMORROW, label: 'Mañana', date: TOMORROW },
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
    expect(targets[0]).toEqual({ key: '2026-10-15', label: `${name.charAt(0).toUpperCase()}${name.slice(1)} 15`, date: '2026-10-15' })
    expect(targets.slice(1).map((target) => target.date)).toEqual([TODAY, TOMORROW, null])
  })

  test('un día pasado también es un destino', () => {
    expect(composeTargets('2026-09-20', TODAY)).toHaveLength(4)
    expect(composeTargets('2026-09-20', TODAY)[0]!.date).toBe('2026-09-20')
  })

  test('con el + de una sección, ella va delante, en el día que se mira', () => {
    const targets = composeTargets(TOMORROW, TODAY, { id: 's1', name: 'Compra' })
    expect(targets[0]).toEqual({ key: `${TOMORROW}#s1`, label: 'Compra', date: TOMORROW, sectionId: 's1' })
    expect(targets.slice(1).map((target) => target.label)).toEqual(['Mañana', 'Hoy', 'Sin fecha'])
    expect(new Set(targets.map((target) => target.key)).size).toBe(targets.length)
  })

  test('en la Bandeja no hay secciones', () => {
    expect(composeTargets(null, TODAY, { id: 's1', name: 'Compra' }).map((target) => target.label)).toEqual(['Sin fecha', 'Hoy', 'Mañana'])
  })
})

describe('addLabel con sección', () => {
  test('dice la sección', () => {
    expect(addLabel(TODAY, TODAY, 'Compra')).toBe('Añadir a Compra')
  })
})
