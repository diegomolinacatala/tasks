import { describe, expect, test } from 'vitest'
import { parseShoppingItem, parseShoppingText } from './shoppingParse'

describe('parseShoppingItem', () => {
  test('un nombre suelto, con mayúscula inicial y sin espacios de más', () => {
    expect(parseShoppingItem('  pan   de molde ')).toEqual({ name: 'Pan de molde', qty: null })
  })

  test('la cantidad delante, con su unidad', () => {
    expect(parseShoppingItem('2 kg de arroz')).toEqual({ name: 'Arroz', qty: '2 kg' })
    expect(parseShoppingItem('1,5 l de leche')).toEqual({ name: 'Leche', qty: '1,5 l' })
    expect(parseShoppingItem('3 latas atún')).toEqual({ name: 'Atún', qty: '3 latas' })
    expect(parseShoppingItem('media docena de huevos')).toEqual({ name: 'Huevos', qty: '½ docena' })
    expect(parseShoppingItem('2 bottles of water')).toEqual({ name: 'Water', qty: '2 bottles' })
  })

  test('una cifra sola delante es cuántas', () => {
    expect(parseShoppingItem('3 manzanas')).toEqual({ name: 'Manzanas', qty: '3' })
  })

  test('la cantidad detrás con una equis', () => {
    expect(parseShoppingItem('pan x2')).toEqual({ name: 'Pan', qty: '×2' })
    expect(parseShoppingItem('pan x 3')).toEqual({ name: 'Pan', qty: '×3' })
    expect(parseShoppingItem('Pilas AA × 4')).toEqual({ name: 'Pilas AA', qty: '×4' })
    expect(parseShoppingItem('2 x pan')).toEqual({ name: 'Pan', qty: '2' })
  })

  test('una equis que es la última letra del nombre no es cantidad', () => {
    expect(parseShoppingItem('Kleenex 2')).toEqual({ name: 'Kleenex 2', qty: null })
    expect(parseShoppingItem('Durex')).toEqual({ name: 'Durex', qty: null })
  })

  test('un nombre que empieza por número pero no es cantidad se queda entero', () => {
    expect(parseShoppingItem('7up')).toEqual({ name: '7up', qty: null })
  })

  test('nada sin nombre', () => {
    expect(parseShoppingItem('   ')).toBeNull()
    expect(parseShoppingItem('2 kg de ')).toBeNull()
  })
})

describe('parseShoppingText', () => {
  test('varias cosas separadas por comas y por "y"', () => {
    expect(parseShoppingText('pan, leche y huevos')).toEqual([
      { name: 'Pan', qty: null },
      { name: 'Leche', qty: null },
      { name: 'Huevos', qty: null },
    ])
  })

  test('cada una con su cantidad, también en inglés', () => {
    expect(parseShoppingText('2 kg de arroz; pan x2 and 3 apples')).toEqual([
      { name: 'Arroz', qty: '2 kg' },
      { name: 'Pan', qty: '×2' },
      { name: 'Apples', qty: '3' },
    ])
    expect(parseShoppingText('2 bottles of water and bread')).toEqual([
      { name: 'Water', qty: '2 bottles' },
      { name: 'Bread', qty: null },
    ])
  })
})
