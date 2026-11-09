import { describe, expect, test } from 'vitest'
import { APP_STORE_URL, compareVersions, offeredUpdate, parseStoreCheck, releaseNotes, storeLocale } from './update'

describe('compareVersions', () => {
  test('por números, no por texto', () => {
    expect(compareVersions('1.10', '1.9')).toBe(1)
    expect(compareVersions('1.6', '1.6.0')).toBe(0)
    expect(compareVersions('1.5', '1.6')).toBe(-1)
    expect(compareVersions('2.0', '1.99')).toBe(1)
  })
})

describe('releaseNotes', () => {
  test('una novedad por línea, sin viñetas ni huecos, y con tope', () => {
    expect(releaseNotes('• Tu calendario en la Agenda.\n\n- Un + en cada sección.\r\n* Otra')).toEqual([
      'Tu calendario en la Agenda.',
      'Un + en cada sección.',
      'Otra',
    ])
    expect(releaseNotes(Array.from({ length: 10 }, (_, index) => `• ${index}`).join('\n'))).toHaveLength(6)
  })
})

describe('parseStoreCheck', () => {
  test('valida lo que llega de la búsqueda de la App Store', () => {
    expect(parseStoreCheck({ installed: '1.6', version: '1.7', notes: '• Nuevo', url: 'https://apps.apple.com/es/app/x/id1' })).toEqual({
      installed: '1.6',
      release: { version: '1.7', notes: ['Nuevo'], url: 'https://apps.apple.com/es/app/x/id1' },
    })
  })

  test('sin versión que se entienda no hay nada; una URL ajena se cambia por la de la App Store', () => {
    expect(parseStoreCheck({ installed: '1.6' })).toEqual({ installed: '1.6', release: null })
    expect(parseStoreCheck({ installed: '1.6', version: 'beta' }).release).toBeNull()
    expect(parseStoreCheck({ installed: '1.6', version: '1.7', url: 'https://otra.web/' }).release?.url).toBe(APP_STORE_URL)
    expect(parseStoreCheck(null)).toEqual({ installed: '', release: null })
  })
})

describe('offeredUpdate', () => {
  const release = { version: '1.7', notes: [], url: APP_STORE_URL }

  test('se ofrece si la publicada es más nueva', () => {
    expect(offeredUpdate({ installed: '1.6', release }, null)).toBe(release)
  })

  test('no, si ya está al día o va por delante (TestFlight)', () => {
    expect(offeredUpdate({ installed: '1.7', release }, null)).toBeNull()
    expect(offeredUpdate({ installed: '1.8', release }, null)).toBeNull()
  })

  test('no, si a esa versión ya se dijo "Ahora no"; sí a la siguiente', () => {
    expect(offeredUpdate({ installed: '1.6', release }, '1.7')).toBeNull()
    expect(offeredUpdate({ installed: '1.6', release: { ...release, version: '1.8' } }, '1.7')).not.toBeNull()
  })

  test('sin versión instalada que se entienda, nada', () => {
    expect(offeredUpdate({ installed: '', release }, null)).toBeNull()
  })
})

describe('storeLocale', () => {
  test('la tienda del país y las novedades en el idioma de la app', () => {
    expect(storeLocale('es', 'ES')).toEqual({ country: 'es', lang: 'es_es' })
    expect(storeLocale('en', 'GB')).toEqual({ country: 'gb', lang: 'en_us' })
    expect(storeLocale('en', null)).toEqual({ country: 'us', lang: 'en_us' })
  })
})
