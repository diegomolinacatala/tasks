import type { ShoppingItem, ShoppingMemory, ShoppingState } from '../types'
import { fold } from './normalize'
import { compareNames } from './order'
import { capitalize } from './title'

/**
 * La cesta: lo que hay que comprar, aparte de las tareas. Una lista corta que se tacha en la tienda y
 * recuerda lo que sueles comprar (las habituales) para añadirlo de un toque. Nada de categorías ni
 * pasillos: lo que no se dice no existe.
 */

export const MAX_SHOPPING_ITEMS = 200
export const MAX_SHOPPING_NAME = 60
/** Lo que se recuerda de otras compras: lo bastante para las habituales, no una base de datos. */
export const MAX_SHOPPING_MEMORY = 60
/** Habituales que se ofrecen de una vez: más abruman. */
export const MAX_SUGGESTIONS = 8
/** Una cantidad es corta: `2 kg`, `½ docena`. */
const MAX_QTY_CHARS = 12

/** Nombre comparable: sin tildes, mayúsculas ni espacios de más. */
export const shoppingKey = (name: string): string => fold(name).replace(/\s+/g, ' ').trim()

export const cleanShoppingName = (name: string): string => capitalize(name.replace(/\s+/g, ' ').trim().slice(0, MAX_SHOPPING_NAME))
/** Cantidad saneada desde datos externos. */
export const cleanQty = (raw: unknown): string | null => {
  if (typeof raw !== 'string') return null
  const qty = raw.replace(/\s+/g, ' ').trim().slice(0, MAX_QTY_CHARS)
  return qty || null
}

export const emptyShopping = (): ShoppingState => ({ items: [], history: [], placeId: null })

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null

function normalizeItem(raw: unknown): ShoppingItem | null {
  if (!isObject(raw) || typeof raw.id !== 'string' || !raw.id || typeof raw.name !== 'string') return null
  const name = cleanShoppingName(raw.name)
  if (!name) return null
  const createdAt = typeof raw.createdAt === 'number' && Number.isFinite(raw.createdAt) ? raw.createdAt : 0
  return {
    id: raw.id,
    name,
    qty: cleanQty(raw.qty),
    done: raw.done === true,
    order: typeof raw.order === 'number' && Number.isFinite(raw.order) ? raw.order : 0,
    createdAt,
    doneAt: typeof raw.doneAt === 'number' && Number.isFinite(raw.doneAt) ? raw.doneAt : null,
  }
}

function normalizeMemory(raw: unknown): ShoppingMemory | null {
  if (!isObject(raw) || typeof raw.name !== 'string') return null
  const name = cleanShoppingName(raw.name)
  if (!name) return null
  const count = typeof raw.count === 'number' && Number.isFinite(raw.count) ? Math.max(1, Math.round(raw.count)) : 1
  const at = typeof raw.at === 'number' && Number.isFinite(raw.at) ? raw.at : 0
  return { name, count, at }
}

/** La cesta saneada desde datos externos (copia, almacenamiento); las copias de antes no la traen. */
export function normalizeShopping(raw: unknown, placeIds: ReadonlySet<string> = new Set()): ShoppingState {
  if (!isObject(raw)) return emptyShopping()
  const seen = new Set<string>()
  const items = (Array.isArray(raw.items) ? raw.items : [])
    .map(normalizeItem)
    .filter((item): item is ShoppingItem => {
      if (!item || seen.has(item.id)) return false
      seen.add(item.id)
      return true
    })
    .slice(0, MAX_SHOPPING_ITEMS)
  const names = new Set<string>()
  const history = (Array.isArray(raw.history) ? raw.history : [])
    .map(normalizeMemory)
    .filter((memory): memory is ShoppingMemory => {
      const key = memory ? shoppingKey(memory.name) : ''
      if (!memory || !key || names.has(key)) return false
      names.add(key)
      return true
    })
    .slice(0, MAX_SHOPPING_MEMORY)
  const placeId = typeof raw.placeId === 'string' && placeIds.has(raw.placeId) ? raw.placeId : null
  return { items, history, placeId }
}

/** Cuántas cosas quedan por comprar (la cifra del icono). */
export const pendingCount = (items: readonly ShoppingItem[]): number => items.filter((item) => !item.done).length

/** Lo pendiente en su orden y lo comprado después, lo último comprado arriba. */
export function sortedItems(items: readonly ShoppingItem[]): { pending: ShoppingItem[]; bought: ShoppingItem[] } {
  const pending = items.filter((item) => !item.done).sort((a, b) => a.order - b.order || a.createdAt - b.createdAt)
  const bought = items.filter((item) => item.done).sort((a, b) => (b.doneAt ?? 0) - (a.doneAt ?? 0) || a.order - b.order)
  return { pending, bought }
}

/** El que ya está en la lista con ese nombre (comprado o no). */
export const findItem = (items: readonly ShoppingItem[], name: string): ShoppingItem | null => {
  const key = shoppingKey(name)
  return key ? (items.find((item) => shoppingKey(item.name) === key) ?? null) : null
}

/**
 * Las habituales: lo más comprado antes que no está ya en la lista, lo más veces primero y, a igual
 * número, lo más reciente. Mientras no se ha comprado nada, ninguna.
 */
export function suggestions(shopping: Pick<ShoppingState, 'items' | 'history'>, max = MAX_SUGGESTIONS): ShoppingMemory[] {
  const listed = new Set(shopping.items.map((item) => shoppingKey(item.name)))
  return [...shopping.history]
    .filter((memory) => !listed.has(shoppingKey(memory.name)))
    .sort((a, b) => b.count - a.count || b.at - a.at || compareNames(a.name, b.name))
    .slice(0, max)
}

/** El historial con una compra más de `name` (o la primera), sin pasar del tope: cae lo menos comprado y más viejo. */
export function remember(history: readonly ShoppingMemory[], name: string, at: number): ShoppingMemory[] {
  const key = shoppingKey(name)
  if (!key) return [...history]
  const existing = history.find((memory) => shoppingKey(memory.name) === key)
  const entry: ShoppingMemory = existing ? { ...existing, count: existing.count + 1, at } : { name: cleanShoppingName(name), count: 1, at }
  const next = existing ? history.map((memory) => (memory === existing ? entry : memory)) : [...history, entry]
  if (next.length <= MAX_SHOPPING_MEMORY) return next
  // Lo recién comprado se queda: cae otro, el menos comprado y más viejo.
  const drop = next.filter((memory) => memory !== entry).sort((a, b) => a.count - b.count || a.at - b.at)[0]
  return next.filter((memory) => memory !== drop)
}

/** Texto de una fila: `Arroz · 2 kg` / `Pan ×2` para los avisos. */
export const itemLabel = (item: Pick<ShoppingItem, 'name' | 'qty'>): string =>
  item.qty ? (item.qty.startsWith('×') ? `${item.name} ${item.qty}` : `${item.name} · ${item.qty}`) : item.name

const BODY_PREVIEW = 3

/** `Pan · Leche · Huevos · +2`: el cuerpo del aviso al llegar a la tienda. */
export function shoppingBody(items: readonly ShoppingItem[]): string {
  const { pending } = sortedItems(items)
  const names = pending.map((item) => item.name)
  const rest = names.length - BODY_PREVIEW
  return [...names.slice(0, BODY_PREVIEW), rest > 0 ? `+${rest}` : ''].filter(Boolean).join(' · ')
}
