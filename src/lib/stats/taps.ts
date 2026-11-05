/**
 * El mapa de calor: dónde cae un toque en una rejilla de la pantalla y qué elemento era, sacado solo
 * de sus clases CSS (que son de la app, no de quien la usa). Nunca texto, `aria-label` ni ids: los
 * títulos de las tareas son privados.
 */

/** La misma rejilla que el servidor y el panel (`worker/src/stats.ts`). */
export const GRID_COLS = 16
export const GRID_ROWS = 32

export function cellOf(x: number, y: number, width: number, height: number): number | null {
  if (!(width > 0) || !(height > 0) || x < 0 || y < 0 || x >= width || y >= height) return null
  const col = Math.min(GRID_COLS - 1, Math.floor((x / width) * GRID_COLS))
  const row = Math.min(GRID_ROWS - 1, Math.floor((y / height) * GRID_ROWS))
  return row * GRID_COLS + col
}

const TARGET = /^[a-z][a-z0-9_-]{0,47}$/
/** Estados y variantes no dicen qué es el elemento: `is-open`, `chip--on`, `has-x`. */
const STATE = /^(is|has)-/

/**
 * El nombre de un elemento: su primera clase "de bloque" (sin estado ni modificador `--`), o `null`
 * si no tiene ninguna que sirva. Lo que no cumple el formato se descarta, no se recorta.
 */
export function targetOf(classNames: readonly string[]): string | null {
  for (const name of classNames) {
    if (STATE.test(name)) continue
    const base = name.split('--')[0] ?? ''
    if (TARGET.test(base)) return base
  }
  return null
}

/** El nombre de una pantalla tal como lo admite el servidor. */
export const SCREEN = /^[a-z][a-z0-9:_-]{0,31}$/

export interface Tap {
  x: number
  y: number
  at: number
}

/** Rabia: el tercer toque en menos de 0,8 s en el mismo sitio (24 px). */
export const RAGE_TAPS = 3
export const RAGE_MS = 800
export const RAGE_PX = 24

/** Los toques recientes que siguen contando (para el siguiente) y si este es de rabia. */
export function rageAfter(recent: readonly Tap[], tap: Tap): { recent: Tap[]; rage: boolean } {
  const near = recent.filter((t) => tap.at - t.at <= RAGE_MS && Math.hypot(t.x - tap.x, t.y - tap.y) <= RAGE_PX)
  const next = [...near, tap]
  return { recent: next, rage: next.length >= RAGE_TAPS }
}
