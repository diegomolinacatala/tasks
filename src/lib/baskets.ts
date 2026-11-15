import type { RoomLink, SharedBasket, ShoppingState } from '../types'
import { normalizeShopping } from './shopping'

/** Cestas compartidas como mucho: son pestañas en un popover, no una lista sin fin. */
export const MAX_BASKETS = 12
export const MAX_BASKET_NAME = 30

const ROOM_ID = /^[A-Za-z0-9_-]{22}$/
const KEY = /^[A-Za-z0-9_-]{43}$/
const TOKEN = /^[A-Za-z0-9_-]{20,100}$/
const MEMBER = /^[A-Za-z0-9_-]{6,40}$/

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null

export const isRoomId = (value: unknown): value is string => typeof value === 'string' && ROOM_ID.test(value)
export const isRoomKey = (value: unknown): value is string => typeof value === 'string' && KEY.test(value)

export const cleanBasketName = (raw: unknown): string =>
  typeof raw === 'string' ? raw.replace(/\s+/g, ' ').trim().slice(0, MAX_BASKET_NAME) : ''

export function normalizeRoomLink(raw: unknown): RoomLink | null {
  if (!isObject(raw)) return null
  const { room, key, member, token } = raw
  if (!isRoomId(room) || !isRoomKey(key) || typeof member !== 'string' || !MEMBER.test(member)) return null
  if (typeof token !== 'string' || !TOKEN.test(token)) return null
  return { room, key, member, token, owner: raw.owner === true }
}

/** Una cesta compartida saneada; `null` si le faltan sus credenciales (sin ellas no es de nadie). */
export function normalizeBasket(raw: unknown, placeIds: ReadonlySet<string>): SharedBasket | null {
  if (!isObject(raw)) return null
  const link = normalizeRoomLink(raw.link)
  if (!link || raw.id !== link.room) return null
  const shopping = normalizeShopping(raw, placeIds)
  return {
    id: link.room,
    name: cleanBasketName(raw.name) || '…',
    items: shopping.items,
    history: shopping.history,
    placeId: shopping.placeId,
    order: typeof raw.order === 'number' && Number.isFinite(raw.order) ? raw.order : 0,
    link,
  }
}

export function normalizeBaskets(raw: unknown, placeIds: ReadonlySet<string>): SharedBasket[] {
  if (!Array.isArray(raw)) return []
  const seen = new Set<string>()
  return raw
    .map((item) => normalizeBasket(item, placeIds))
    .filter((basket): basket is SharedBasket => {
      if (!basket || seen.has(basket.id)) return false
      seen.add(basket.id)
      return true
    })
    .slice(0, MAX_BASKETS)
}

/** La cesta como `ShoppingState`, para reutilizar la lógica de la propia. */
export const basketShopping = (basket: SharedBasket): ShoppingState => ({
  items: basket.items,
  history: basket.history,
  placeId: basket.placeId,
})

export const sortedBaskets = (baskets: readonly SharedBasket[]): SharedBasket[] =>
  [...baskets].sort((a, b) => a.order - b.order || (a.id < b.id ? -1 : 1))

export const nextBasketOrder = (baskets: readonly SharedBasket[]): number =>
  baskets.reduce((max, basket) => Math.max(max, basket.order + 1), 0)
