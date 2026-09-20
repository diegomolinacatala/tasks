import { describe, expect, test } from 'vitest'
import {
  DEFAULT_IMPORTANCE,
  IMPORTANCE_STEP_PX,
  MAX_IMPORTANCE,
  MIN_IMPORTANCE,
  byImportance,
  clampImportance,
  importanceFromDrag,
  importanceScale,
  nextImportance,
  normalizeImportance,
} from './importance'

describe('importancia', () => {
  test('la escala va del 1 al 10 y lo normal es el 1', () => {
    expect([MIN_IMPORTANCE, MAX_IMPORTANCE, DEFAULT_IMPORTANCE]).toEqual([1, 10, 1])
    expect(clampImportance(0)).toBe(1)
    expect(clampImportance(14)).toBe(10)
    expect(clampImportance(4.4)).toBe(4)
  })

  test('lo que llega de fuera sin forma de número vale lo normal', () => {
    expect(normalizeImportance(undefined)).toBe(1)
    expect(normalizeImportance('7')).toBe(1)
    expect(normalizeImportance(Number.NaN)).toBe(1)
    expect(normalizeImportance(7)).toBe(7)
    expect(normalizeImportance(99)).toBe(10)
  })

  test('el título crece de 0 a 1 y cada punto multiplica el tamaño por lo mismo', () => {
    expect(importanceScale(1)).toBe(0)
    expect(importanceScale(10)).toBeCloseTo(1)
    // Tamaño relativo 1 + escala: el cociente entre puntos seguidos es constante.
    const size = (level: number) => 1 + importanceScale(level)
    expect(size(3) / size(2)).toBeCloseTo(size(9) / size(8))
    expect(importanceScale(20)).toBe(importanceScale(10))
  })

  test('arrastrar arriba o a la derecha sube; abajo o a la izquierda, baja', () => {
    expect(importanceFromDrag(3, 0, -IMPORTANCE_STEP_PX * 2)).toBe(5)
    expect(importanceFromDrag(3, IMPORTANCE_STEP_PX, 0)).toBe(4)
    expect(importanceFromDrag(3, 0, IMPORTANCE_STEP_PX)).toBe(2)
    expect(importanceFromDrag(3, -IMPORTANCE_STEP_PX * 10, 0)).toBe(1)
    expect(importanceFromDrag(3, 4, -4)).toBe(3)
  })

  test('tocar sube un punto y, pasado el 10, vuelve a lo normal', () => {
    expect(nextImportance(1)).toBe(2)
    expect(nextImportance(9)).toBe(10)
    expect(nextImportance(10)).toBe(1)
  })

  test('ordenar por importancia respeta el orden previo entre iguales', () => {
    const items = [
      { id: 'a', importance: 1 },
      { id: 'b', importance: 5 },
      { id: 'c', importance: 1 },
      { id: 'd', importance: 5 },
    ]
    expect([...items].sort(byImportance).map((item) => item.id)).toEqual(['b', 'd', 'a', 'c'])
  })
})
