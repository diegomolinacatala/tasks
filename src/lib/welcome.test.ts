import { describe, expect, test } from 'vitest'
import type { PlateId } from './welcome'
import { FULL_WELCOME, PLATE_SINCE, WELCOME_VERSION, availablePlates, normalizeWelcome, platesAfter, welcomeOnLaunch } from './welcome'

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

  test('sin lugares (la PWA), la lámina de los lugares no cuenta como nueva', () => {
    expect(availablePlates(false, false)).not.toContain('places')
    expect(availablePlates(true, true)).toContain('places')
    // Quien vio la 5 en la PWA no tiene nada nuevo; en el iPhone, los lugares (la 6).
    expect(welcomeOnLaunch(false, 5, availablePlates(false, false))).toBeNull()
    expect(welcomeOnLaunch(false, 5, availablePlates(true, true))).toEqual({ after: 5, news: true })
  })

  test('sin calendario (la PWA), la lámina del calendario no cuenta como nueva', () => {
    expect(availablePlates(false)).not.toContain('calendar')
    // Sin Gestos (la 5) de por medio, lo único posterior a la 4 es el calendario: en la PWA no cuenta.
    const butSwipe = (calendar: boolean) => availablePlates(calendar).filter((id) => id !== 'swipe')
    expect(welcomeOnLaunch(false, 3, butSwipe(false))).toBeNull()
    expect(welcomeOnLaunch(false, 3, butSwipe(true))).toEqual({ after: 3, news: true })
    expect(welcomeOnLaunch(false, 2, availablePlates(false))).toEqual({ after: 2, news: true })
    expect(welcomeOnLaunch(false, WELCOME_VERSION, availablePlates(false))).toBeNull()
  })
})

describe('platesAfter', () => {
  const plates: { id: PlateId }[] = [
    { id: 'write' },
    { id: 'details' },
    { id: 'swipe' },
    { id: 'month' },
    { id: 'routine' },
    { id: 'places' },
    { id: 'suggest' },
    { id: 'calendar' },
  ]

  test('con 0 van todas, en su orden', () => {
    expect(platesAfter(plates, 0).map((plate) => plate.id)).toEqual(['write', 'details', 'swipe', 'month', 'routine', 'places', 'suggest', 'calendar'])
  })

  test('quien vio la de la 1.2 ve lo de después: la ficha, los gestos (versión 5), los lugares, las sugerencias y el calendario', () => {
    expect(platesAfter(plates, 1).map((plate) => plate.id)).toEqual(['details', 'swipe', 'places', 'suggest', 'calendar'])
  })

  test('quien vio la de la 1.4 ve los gestos, los lugares y el calendario', () => {
    expect(platesAfter(plates, 3).map((plate) => plate.id)).toEqual(['swipe', 'places', 'calendar'])
  })

  test('sin el calendario ni los lugares (la PWA), quien vio la de la 1.4 solo tiene los gestos', () => {
    expect(platesAfter(plates.filter((plate) => plate.id !== 'calendar' && plate.id !== 'places'), 3).map((plate) => plate.id)).toEqual(['swipe'])
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
