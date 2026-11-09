import { describe, expect, test } from 'vitest'
import { ROUTINE_EMOJIS, cleanEmoji, suggestEmoji } from './emoji'

describe('cleanEmoji', () => {
  test('se queda con el primer emoji y tira el resto', () => {
    expect(cleanEmoji('☕')).toBe('☕')
    expect(cleanEmoji('  💊 creatina')).toBe('💊')
    expect(cleanEmoji('hola 📖📚')).toBe('📖')
  })

  test('respeta variantes: selector, tono de piel, uniones y banderas', () => {
    expect(cleanEmoji('🏋️')).toBe('🏋️')
    expect(cleanEmoji('🏃🏽‍♀️ correr')).toBe('🏃🏽‍♀️')
    expect(cleanEmoji('👨‍👩‍👧')).toBe('👨‍👩‍👧')
    expect(cleanEmoji('🇪🇸')).toBe('🇪🇸')
    expect(cleanEmoji('1️⃣')).toBe('1️⃣')
  })

  test('sin emoji, o si no es texto, no hay nada', () => {
    expect(cleanEmoji('TC')).toBeNull()
    expect(cleanEmoji('10:00')).toBeNull()
    expect(cleanEmoji('')).toBeNull()
    expect(cleanEmoji(null)).toBeNull()
    expect(cleanEmoji(7)).toBeNull()
  })

  test('los del selector son todos válidos y no se repiten', () => {
    expect(ROUTINE_EMOJIS.every((emoji) => cleanEmoji(emoji) === emoji)).toBe(true)
    expect(new Set(ROUTINE_EMOJIS).size).toBe(ROUTINE_EMOJIS.length)
  })
})

describe('suggestEmoji', () => {
  test('propone el que le pega al nombre, con o sin tildes ni mayúsculas', () => {
    expect(suggestEmoji('Tomar creatina')).toBe('💊')
    expect(suggestEmoji('Leer 20 minutos')).toBe('📖')
    expect(suggestEmoji('MEDITACIÓN')).toBe('🧘')
    expect(suggestEmoji('Café con calma')).toBe('☕')
  })

  test('lo concreto gana a lo general', () => {
    expect(suggestEmoji('Pasear al perro')).toBe('🐕')
    expect(suggestEmoji('Dar un paseo')).toBe('🚶')
  })

  test('lo que propone siempre es un emoji válido', () => {
    for (const title of ['gimnasio', 'regar las plantas', 'lavadora', 'llamar a la abuela', 'repasar inglés']) {
      const emoji = suggestEmoji(title)
      expect(emoji).not.toBeNull()
      expect(cleanEmoji(emoji)).toBe(emoji)
    }
  })

  test('si no reconoce nada, no inventa', () => {
    expect(suggestEmoji('Cosa rara')).toBeNull()
    expect(suggestEmoji('')).toBeNull()
  })
})
