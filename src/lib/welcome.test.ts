import { describe, expect, test } from 'vitest'
import type { PlateId } from './welcome'
import { FULL_WELCOME, PLATE_SINCE, WELCOME_VERSION, normalizeWelcome, platesAfter, welcomeOnLaunch } from './welcome'

describe('welcomeOnLaunch', () => {
  test('la primera vez, entera y presentando la app', () => {
    expect(welcomeOnLaunch(true, 0)).toEqual({ after: 0, news: false })
    expect(welcomeOnLaunch(true, 0)).toBe(FULL_WELCOME)
  })

  test('quien actualiza sin haberla visto nunca la ve entera, como novedades', () => {
    expect(welcomeOnLaunch(false, 0)).toEqual({ after: 0, news: true })
  })

  test('quien ya vio la versión actual no la vuelve a ver', () => {
    expect(welcomeOnLaunch(false, WELCOME_VERSION)).toBeNull()
    expect(welcomeOnLaunch(false, WELCOME_VERSION + 3)).toBeNull()
  })

  test('tras una actualización con láminas nuevas, solo lo posterior a lo visto', () => {
    expect(welcomeOnLaunch(false, WELCOME_VERSION - 1)).toEqual({ after: WELCOME_VERSION - 1, news: true })
  })
})

describe('platesAfter', () => {
  const plates: { id: PlateId }[] = [{ id: 'write' }, { id: 'details' }, { id: 'swipe' }, { id: 'month' }, { id: 'routine' }, { id: 'suggest' }]

  test('con 0 van todas, en su orden', () => {
    expect(platesAfter(plates, 0).map((plate) => plate.id)).toEqual(['write', 'details', 'swipe', 'month', 'routine', 'suggest'])
  })

  test('quien vio la de la 1.2 ve lo de la 1.3 y la 1.4: la ficha del compositor y las sugerencias', () => {
    expect(platesAfter(plates, 1).map((plate) => plate.id)).toEqual(['details', 'suggest'])
  })

  test('quien vio la de la 1.3 solo ve las sugerencias', () => {
    expect(platesAfter(plates, 2).map((plate) => plate.id)).toEqual(['suggest'])
  })

  test('con la versión actual no queda ninguna', () => {
    expect(platesAfter(plates, WELCOME_VERSION)).toEqual([])
  })

  test('solo las que entraron después de lo visto', () => {
    const since = (id: PlateId) => PLATE_SINCE[id]
    const after = WELCOME_VERSION - 1
    expect(platesAfter(plates, after).every((plate) => since(plate.id) > after)).toBe(true)
    expect(platesAfter(plates, after).length).toBeGreaterThan(0)
  })
})

describe('WELCOME_VERSION', () => {
  test('es la de la lámina más reciente', () => {
    expect(WELCOME_VERSION).toBe(Math.max(...Object.values(PLATE_SINCE)))
    expect(WELCOME_VERSION).toBeGreaterThanOrEqual(1)
  })
})

describe('normalizeWelcome', () => {
  test('lo que no es un entero positivo cuenta como no vista', () => {
    expect(normalizeWelcome(undefined)).toBe(0)
    expect(normalizeWelcome(null)).toBe(0)
    expect(normalizeWelcome('2')).toBe(0)
    expect(normalizeWelcome(-1)).toBe(0)
    expect(normalizeWelcome(1.5)).toBe(0)
    expect(normalizeWelcome(Number.NaN)).toBe(0)
  })

  test('respeta la versión vista', () => {
    expect(normalizeWelcome(1)).toBe(1)
    expect(normalizeWelcome(7)).toBe(7)
  })
})
