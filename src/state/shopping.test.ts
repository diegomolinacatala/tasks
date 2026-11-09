import { describe, expect, test } from 'vitest'
import type { AppState } from '../types'
import type { Action } from './actions'
import { emptyState, reducer } from './reducer'

const NOW = 1_000

const run = (state: AppState, ...actions: Action[]) => actions.reduce(reducer, state)

const withItems = (...names: string[]): AppState =>
  run(emptyState(), ...names.map((name, index): Action => ({ type: 'shopping/add', name, id: `i${index}`, now: NOW + index })))

const names = (state: AppState) => state.shopping.items.map((item) => `${item.name}${item.done ? '✓' : ''}${item.qty ? ` ${item.qty}` : ''}`)

describe('shopping/add', () => {
  test('añade al final, con mayúscula y cantidad', () => {
    const state = run(withItems('pan'), { type: 'shopping/add', name: 'arroz', qty: '2 kg', now: NOW })
    expect(names(state)).toEqual(['Pan', 'Arroz 2 kg'])
    expect(state.shopping.items[1]?.order).toBe(1)
  })

  test('lo que ya está pendiente no se duplica; con cantidad, la cambia', () => {
    const state = withItems('pan')
    expect(reducer(state, { type: 'shopping/add', name: 'PAN', now: NOW })).toBe(state)
    expect(names(reducer(state, { type: 'shopping/add', name: 'pan', qty: '×2', now: NOW }))).toEqual(['Pan ×2'])
  })

  test('lo comprado vuelve a pendiente, al final', () => {
    const bought = run(withItems('pan', 'leche'), { type: 'shopping/toggle', id: 'i0', now: NOW })
    const again = reducer(bought, { type: 'shopping/add', name: 'pan', now: NOW })
    const pan = again.shopping.items.find((item) => item.id === 'i0')
    expect(pan).toMatchObject({ done: false, doneAt: null, order: 2 })
  })

  test('sin nombre o con un id repetido, nada', () => {
    const state = withItems('pan')
    expect(reducer(state, { type: 'shopping/add', name: '  ', now: NOW })).toBe(state)
    expect(reducer(state, { type: 'shopping/add', name: 'otra', id: 'i0', now: NOW })).toBe(state)
  })

  test('no muta el estado anterior', () => {
    const before = emptyState()
    reducer(before, { type: 'shopping/add', name: 'pan', now: NOW })
    expect(before.shopping.items).toHaveLength(0)
  })
})

describe('shopping/toggle', () => {
  test('comprar apunta cuándo y lo recuerda; devolverla no borra el recuerdo', () => {
    const state = withItems('pan')
    const bought = reducer(state, { type: 'shopping/toggle', id: 'i0', now: 5_000 })
    expect(bought.shopping.items[0]).toMatchObject({ done: true, doneAt: 5_000 })
    expect(bought.shopping.history).toEqual([{ name: 'Pan', count: 1, at: 5_000 }])
    const back = reducer(bought, { type: 'shopping/toggle', id: 'i0', now: 6_000 })
    expect(back.shopping.items[0]).toMatchObject({ done: false, doneAt: null })
    expect(back.shopping.history).toEqual(bought.shopping.history)
    // Comprarla otra vez suma.
    expect(reducer(back, { type: 'shopping/toggle', id: 'i0', now: 7_000 }).shopping.history).toEqual([{ name: 'Pan', count: 2, at: 7_000 }])
  })

  test('un id que no existe no cambia nada', () => {
    const state = withItems('pan')
    expect(reducer(state, { type: 'shopping/toggle', id: 'nada', now: NOW })).toBe(state)
  })
})

describe('shopping/remove, restore y clearDone', () => {
  test('borrar y deshacer devuelve la fila intacta', () => {
    const state = withItems('pan', 'leche')
    const victim = state.shopping.items[1]!
    const removed = reducer(state, { type: 'shopping/remove', id: victim.id })
    expect(names(removed)).toEqual(['Pan'])
    expect(reducer(removed, { type: 'shopping/restore', item: victim }).shopping.items).toContainEqual(victim)
    expect(reducer(state, { type: 'shopping/restore', item: victim })).toBe(state)
  })

  test('vaciar la cesta quita solo lo comprado', () => {
    const state = run(withItems('pan', 'leche', 'huevos'), { type: 'shopping/toggle', id: 'i0', now: NOW }, { type: 'shopping/toggle', id: 'i2', now: NOW })
    const cleared = reducer(state, { type: 'shopping/clearDone' })
    expect(names(cleared)).toEqual(['Leche'])
    expect(reducer(cleared, { type: 'shopping/clearDone' })).toBe(cleared)
  })
})

describe('shopping/place', () => {
  test('solo un lugar que existe; borrar el lugar lo quita', () => {
    const state = run(emptyState(), { type: 'place/add', id: 'm', name: 'Mercadona' })
    expect(reducer(state, { type: 'shopping/place', placeId: 'nada' })).toBe(state)
    const linked = reducer(state, { type: 'shopping/place', placeId: 'm' })
    expect(linked.shopping.placeId).toBe('m')
    const removed = reducer(linked, { type: 'place/remove', id: 'm' })
    expect(removed.shopping.placeId).toBeNull()
    // Deshacer el borrado devuelve también la tienda de la cesta.
    const place = linked.places[0]!
    expect(reducer(removed, { type: 'place/restore', place, reminders: [], shopping: true }).shopping.placeId).toBe('m')
    expect(reducer(removed, { type: 'place/restore', place, reminders: [] }).shopping.placeId).toBeNull()
    expect(reducer(linked, { type: 'shopping/place', placeId: null }).shopping.placeId).toBeNull()
  })
})

describe('la cesta y el resto del estado', () => {
  test('borrarlo todo la vacía; una copia la trae consigo', () => {
    const state = withItems('pan')
    expect(reducer(state, { type: 'state/clear' }).shopping).toEqual({ items: [], history: [], placeId: null })
    expect(reducer(emptyState(), { type: 'state/import', state }).shopping).toEqual(state.shopping)
  })
})
