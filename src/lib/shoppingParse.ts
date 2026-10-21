import { cleanShoppingName } from './shopping'

/**
 * Lo que se escribe en la cesta → filas: "pan, leche y huevos" son tres; "2 kg de arroz" y "pan x2"
 * llevan cantidad. Va aparte de `shopping.ts` porque solo lo usa la cesta, no el reducer: así sus
 * expresiones no entran en el trozo principal.
 */

const MAX_QTY = 12

/** Unidades que se entienden delante del nombre ("2 kg de arroz", "3 latas de atún", "2 bottles of water"). */
const UNITS =
  'kg|kilos?|g|gr|gramos?|l|litros?|ml|cl|uds?|unidades?|paquetes?|botellas?|latas?|docenas?|bolsas?|cajas?|barras?|cartones?|tarros?|sobres?|bricks?|packs?|lbs?|oz|cans?|bottles?|bags?|boxes?|dozen|loaves|loaf|cartons?|jars?'
/** "2 kg de arroz", "3 manzanas", "media docena de huevos", "1,5 l de leche", "2 x pan". */
const LEADING = new RegExp(`^(\\d+(?:[.,]\\d+)?|media|medio|half)\\s*(?:[x×]\\s*)?(${UNITS})?\\.?\\s+(.+)$`, 'i')
/** El "de" entre la cantidad y el nombre ("2 kg de arroz"); solo, no es nombre. */
const OF = /^(?:de|of)(?:\s+|$)/i
/** "pan x2", "pan ×2", "pan x 3". La equis de teclado pide un espacio delante: "Kleenex 2" no es "Kleene ×2". */
const TRAILING = /^(.+?)(?:\s+x|\s*×)\s*(\d+)$/i
/** Lo que separa varias cosas escritas de una vez: comas, puntos y comas, " y ", " and ". */
const SPLIT = /\s*(?:,|;|\s+y\s+|\s+and\s+)\s*/i

export interface ShoppingDraft {
  name: string
  /** `2 kg`, `×3`, `3`. */
  qty: string | null
}

/** Una cosa escrita → nombre y cantidad. `null` si no queda nombre. */
export function parseShoppingItem(text: string): ShoppingDraft | null {
  const raw = text.replace(/\s+/g, ' ').trim()
  if (!raw) return null
  const trailing = TRAILING.exec(raw)
  if (trailing?.[1] && trailing[2]) return { name: cleanShoppingName(trailing[1]), qty: `×${Number(trailing[2])}` }
  const leading = LEADING.exec(raw)
  if (leading?.[3]) {
    const [, amount = '', unit, rest = ''] = leading
    const number = /^(?:media|medio|half)$/i.test(amount) ? '½' : amount
    const name = cleanShoppingName(rest.replace(OF, ''))
    if (!name) return null
    // "3 manzanas" lleva la cifra sola; "2 kg de arroz", la cifra con su unidad.
    return { name, qty: (unit ? `${number} ${unit.toLowerCase()}` : number).slice(0, MAX_QTY) }
  }
  const name = cleanShoppingName(raw)
  return name ? { name, qty: null } : null
}

/** Varias cosas de una vez ("pan, leche y huevos"); lo que no tiene nombre no cuenta. */
export function parseShoppingText(text: string): ShoppingDraft[] {
  return text
    .split(SPLIT)
    .map(parseShoppingItem)
    .filter((draft): draft is ShoppingDraft => draft !== null)
}
