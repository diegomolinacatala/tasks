import { describe, expect, test } from 'vitest'
import type { ShoppingItem, ShoppingMemory } from '../types'
import {
  MAX_SHOPPING_MEMORY,
  findItem,
  itemLabel,
  normalizeShopping,
  remember,
  shoppingBody,
  shoppingKey,
  sortedItems,
  suggestions,
} from './shopping'

const item = (partial: Partial<ShoppingItem> & { id: string }): ShoppingItem => ({
  name: partial.id,
  qty: null,
  done: false,
  order: 0,
  createdAt: 0,
  doneAt: null,
  ...partial,
})

describe('sortedItems y findItem', () => {
  const items = [
    item({ id: 'a', name: 'Pan', order: 2 }),
    item({ id: 'b', name: 'Leche', order: 1 }),
    item({ id: 'c', name: 'Huevos', done: true, doneAt: 5 }),
    item({ id: 'd', name: 'Arroz', done: true, doneAt: 9 }),
  ]

  test('lo pendiente por orden, lo comprado con lo último arriba', () => {
    const { pending, bought } = sortedItems(items)
    expect(pending.map((entry) => entry.name)).toEqual(['Leche', 'Pan'])
    expect(bought.map((entry) => entry.name)).toEqual(['Arroz', 'Huevos'])
  })

  test('busca sin tildes ni mayúsculas', () => {
    expect(findItem(items, 'arroz')?.id).toBe('d')
    expect(findItem(items, 'LECHE')?.id).toBe('b')
    expect(findItem(items, 'Queso')).toBeNull()
    expect(shoppingKey('  Atún   fresco ')).toBe('atun fresco')
  })
})

describe('suggestions y remember', () => {
  const history: ShoppingMemory[] = [
    { name: 'Pan', count: 9, at: 1 },
    { name: 'Leche', count: 9, at: 5 },
    { name: 'Huevos', count: 2, at: 3 },
    { name: 'Queso', count: 1, at: 8 },
  ]

  test('lo más comprado primero, a igual veces lo más reciente, sin lo que ya está en la lista', () => {
    const items = [item({ id: 'x', name: 'pan' })]
    expect(suggestions({ items, history }).map((memory) => memory.name)).toEqual(['Leche', 'Huevos', 'Queso'])
  })

  test('como mucho las que se piden', () => {
    expect(suggestions({ items: [], history }, 2).map((memory) => memory.name)).toEqual(['Leche', 'Pan'])
  })

  test('sin historial no hay habituales', () => {
    expect(suggestions({ items: [], history: [] })).toEqual([])
  })

  test('recordar suma una compra o estrena la entrada', () => {
    const next = remember(history, 'huevos', 20)
    expect(next.find((memory) => memory.name === 'Huevos')).toEqual({ name: 'Huevos', count: 3, at: 20 })
    expect(remember(history, 'Atún', 21).at(-1)).toEqual({ name: 'Atún', count: 1, at: 21 })
    // No muta lo que había.
    expect(history[2]?.count).toBe(2)
  })

  test('al tope cae lo menos comprado y más viejo', () => {
    const full = Array.from({ length: MAX_SHOPPING_MEMORY }, (_, index) => ({ name: `Cosa ${index}`, count: 2, at: index }))
    const next = remember(full, 'Nuevo', 999)
    expect(next).toHaveLength(MAX_SHOPPING_MEMORY)
    expect(next.some((memory) => memory.name === 'Cosa 0')).toBe(false)
    expect(next.some((memory) => memory.name === 'Nuevo')).toBe(true)
  })
})

describe('normalizeShopping', () => {
  test('lo que no es una cesta queda vacío', () => {
    expect(normalizeShopping(undefined)).toEqual({ items: [], history: [], placeId: null })
  })

  test('sanea filas, historial y el lugar', () => {
    const raw = {
      items: [
        { id: 'a', name: '  pan ', qty: ' 2 kg ', done: 'no', order: 1, createdAt: 3 },
        { id: 'a', name: 'repetida' },
        { id: 'b', name: '' },
        { name: 'sin id' },
      ],
      history: [{ name: 'leche', count: 2.6, at: 4 }, { name: 'Leche', count: 1 }, { name: '' }],
      placeId: 'm',
    }
    expect(normalizeShopping(raw, new Set(['m']))).toEqual({
      items: [{ id: 'a', name: 'Pan', qty: '2 kg', done: false, order: 1, createdAt: 3, doneAt: null }],
      history: [{ name: 'Leche', count: 3, at: 4 }],
      placeId: 'm',
    })
    expect(normalizeShopping(raw).placeId).toBeNull()
  })
})

describe('etiquetas', () => {
  test('la fila dice su cantidad', () => {
    expect(itemLabel({ name: 'Arroz', qty: '2 kg' })).toBe('Arroz · 2 kg')
    expect(itemLabel({ name: 'Pan', qty: '×2' })).toBe('Pan ×2')
    expect(itemLabel({ name: 'Pan', qty: null })).toBe('Pan')
  })

  test('el cuerpo del aviso resume lo pendiente', () => {
    const items = ['Pan', 'Leche', 'Huevos', 'Arroz', 'Atún'].map((name, order) => item({ id: name, name, order }))
    expect(shoppingBody([...items, item({ id: 'z', name: 'Hecho', done: true })])).toBe('Pan · Leche · Huevos · +2')
    expect(shoppingBody([])).toBe('')
  })
})
