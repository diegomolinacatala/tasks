import { MAX_BASKETS, basketShopping, cleanBasketName, nextBasketOrder } from '../lib/baskets'
import { createId } from '../lib/id'
import { MAX_SHOPPING_ITEMS, cleanQty, cleanShoppingName, findItem, remember } from '../lib/shopping'
import type { AppState, ShoppingItem, ShoppingState } from '../types'
import type { Action } from './actions'

type ShoppingAction = Extract<Action, { type: `shopping/${string}` }>
type BasketAction = Extract<Action, { type: `basket/${string}` }>

const nextShoppingOrder = (items: readonly ShoppingItem[]) => items.reduce((max, item) => Math.max(max, item.order + 1), 0)

/** Una cesta (la propia o una compartida) tras una acción; la misma referencia si no cambia nada. */
export function reduceShopping(shopping: ShoppingState, action: ShoppingAction, placeIds: ReadonlySet<string>): ShoppingState {
  const patch = (next: Partial<ShoppingState>): ShoppingState => ({ ...shopping, ...next })
  switch (action.type) {
    case 'shopping/add': {
      const name = cleanShoppingName(action.name)
      if (!name) return shopping
      if (action.id !== undefined && shopping.items.some((item) => item.id === action.id)) return shopping
      const qty = cleanQty(action.qty)
      const existing = findItem(shopping.items, name)
      if (existing) {
        // Ya pendiente: como mucho cambia la cantidad. Comprada: vuelve a pendiente, al final.
        const back: ShoppingItem = existing.done
          ? { ...existing, done: false, doneAt: null, qty: qty ?? existing.qty, order: nextShoppingOrder(shopping.items) }
          : qty && qty !== existing.qty
            ? { ...existing, qty }
            : existing
        return back === existing ? shopping : patch({ items: shopping.items.map((item) => (item === existing ? back : item)) })
      }
      if (shopping.items.filter((item) => !item.done).length >= MAX_SHOPPING_ITEMS) return shopping
      const item: ShoppingItem = { id: action.id ?? createId(), name, qty, done: false, order: nextShoppingOrder(shopping.items), createdAt: action.now, doneAt: null }
      return patch({ items: [...shopping.items, item] })
    }

    case 'shopping/toggle': {
      const current = shopping.items.find((item) => item.id === action.id)
      if (!current) return shopping
      const toggled: ShoppingItem = current.done ? { ...current, done: false, doneAt: null } : { ...current, done: true, doneAt: action.now }
      const items = shopping.items.map((item) => (item === current ? toggled : item))
      // Comprar es lo que se recuerda; devolverla a pendiente no borra nada.
      return patch({ items, ...(toggled.done ? { history: remember(shopping.history, current.name, action.now) } : {}) })
    }

    case 'shopping/remove':
      return shopping.items.some((item) => item.id === action.id) ? patch({ items: shopping.items.filter((item) => item.id !== action.id) }) : shopping

    case 'shopping/restore':
      return shopping.items.some((item) => item.id === action.item.id) ? shopping : patch({ items: [...shopping.items, action.item] })

    case 'shopping/clearDone':
      return shopping.items.some((item) => item.done) ? patch({ items: shopping.items.filter((item) => !item.done) }) : shopping

    case 'shopping/place': {
      const placeId = action.placeId !== null && placeIds.has(action.placeId) ? action.placeId : null
      return placeId === shopping.placeId ? shopping : patch({ placeId })
    }
  }
}

const placeIdsOf = (state: AppState) => new Set(state.places.map((place) => place.id))

/** Las acciones `shopping/*`, en la cesta propia o en la compartida que digan. */
export function shoppingReducer(state: AppState, action: ShoppingAction): AppState {
  const placeIds = placeIdsOf(state)
  if (action.basket === undefined) {
    const shopping = reduceShopping(state.shopping, action, placeIds)
    return shopping === state.shopping ? state : { ...state, shopping }
  }
  const basket = state.baskets.find((item) => item.id === action.basket)
  if (!basket) return state
  const current = basketShopping(basket)
  const next = reduceShopping(current, action, placeIds)
  if (next === current) return state
  const updated = { ...basket, items: next.items, history: next.history, placeId: next.placeId }
  return { ...state, baskets: state.baskets.map((item) => (item === basket ? updated : item)) }
}

export function basketReducer(state: AppState, action: BasketAction): AppState {
  switch (action.type) {
    case 'basket/add': {
      if (state.baskets.some((basket) => basket.id === action.basket.id) || state.baskets.length >= MAX_BASKETS) return state
      const basket = { ...action.basket, name: cleanBasketName(action.basket.name) || '…', order: nextBasketOrder(state.baskets) }
      return { ...state, baskets: [...state.baskets, basket] }
    }
    case 'basket/rename': {
      const name = cleanBasketName(action.name)
      const basket = state.baskets.find((item) => item.id === action.id)
      if (!name || !basket || basket.name === name) return state
      return { ...state, baskets: state.baskets.map((item) => (item === basket ? { ...basket, name } : item)) }
    }
    case 'basket/owner': {
      const basket = state.baskets.find((item) => item.id === action.id)
      if (!basket || basket.link.owner === action.owner) return state
      const updated = { ...basket, link: { ...basket.link, owner: action.owner } }
      return { ...state, baskets: state.baskets.map((item) => (item === basket ? updated : item)) }
    }
    case 'basket/remove':
      return state.baskets.some((basket) => basket.id === action.id)
        ? { ...state, baskets: state.baskets.filter((basket) => basket.id !== action.id) }
        : state
  }
}
