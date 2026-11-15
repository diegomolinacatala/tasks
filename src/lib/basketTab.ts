/**
 * Qué cesta se ve (la propia, `null`, o una compartida por su id). Lo comparten el popover del móvil y la
 * columna del escritorio, y lo cambia quien abre una cesta desde fuera (una invitación, un aviso).
 */
type Listener = (tab: string | null) => void

const KEY = 'tasks:basket-tab'
const listeners = new Set<Listener>()

let current: string | null = (() => {
  try {
    return localStorage.getItem(KEY)
  } catch {
    return null
  }
})()

export const basketTab = (): string | null => current

export function setBasketTab(tab: string | null): void {
  current = tab
  try {
    if (tab === null) localStorage.removeItem(KEY)
    else localStorage.setItem(KEY, tab)
  } catch {
    // Sin almacenamiento, solo dura la sesión.
  }
  for (const listener of listeners) listener(tab)
}

export function onBasketTab(listener: Listener): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** Pide a la app que enseñe la cesta (en el móvil, abre el popover). */
export const OPEN_BASKET_EVENT = 'tasks:open-basket'

export function openBasket(tab: string | null): void {
  setBasketTab(tab)
  window.dispatchEvent(new Event(OPEN_BASKET_EVENT))
}
