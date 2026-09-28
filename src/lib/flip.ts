/**
 * Filas que se deslizan a su sitio nuevo en vez de saltar (FLIP). Justo antes de una acción que
 * cambia el orden se anota dónde está cada fila con `data-flip`; pintado el cambio, cada una sale
 * de donde estaba y llega a su sitio, y las nuevas entran con un fundido corto. Solo se anima lo
 * que provoca una acción: el arrastre y el mando de importancia ya se mueven con el dedo.
 */

const MOVE_MS = 380
const ENTER_MS = 300
const EASE = 'cubic-bezier(0.2, 0.8, 0.2, 1)'
/**
 * Una acción que no cambia nada (mover al mismo día) no repinta: lo anotado caduca para no animar
 * más tarde un cambio que no tiene que ver.
 */
const STALE_MS = 400

/** Acciones que mueven, añaden o quitan filas. */
const LAYOUT_ACTIONS = new Set([
  'task/toggle',
  'task/add',
  'task/remove',
  'task/restore',
  'task/move',
  'tasks/reschedule',
  'tasks/place',
  'block/toggle',
  'section/toggle',
])

let captured: { at: number; tops: Map<string, number> } | null = null

const rows = () => document.querySelectorAll<HTMLElement>('[data-flip]')

export function changesLayout(type: string): boolean {
  return LAYOUT_ACTIONS.has(type)
}

/** Anota dónde está cada fila ahora mismo. */
export function captureLayout(): void {
  if (typeof document === 'undefined' || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
  const tops = new Map<string, number>()
  for (const row of rows()) {
    const id = row.dataset.flip
    if (id) tops.set(id, row.getBoundingClientRect().top)
  }
  captured = { at: performance.now(), tops }
}

/** Tras pintar el cambio: cada fila anotada vuelve un instante a donde estaba y se desliza. */
export function playLayout(): void {
  const snapshot = captured
  captured = null
  if (!snapshot || performance.now() - snapshot.at > STALE_MS) return
  const before = snapshot.tops
  for (const row of rows()) {
    const id = row.dataset.flip
    if (!id) continue
    const was = before.get(id)
    if (was === undefined) {
      row.animate([{ opacity: 0, transform: 'translateY(-6px)' }, { opacity: 1, transform: 'none' }], {
        duration: ENTER_MS,
        easing: EASE,
      })
      continue
    }
    const dy = was - row.getBoundingClientRect().top
    if (Math.abs(dy) < 1) continue
    row.animate([{ transform: `translateY(${dy}px)` }, { transform: 'none' }], { duration: MOVE_MS, easing: EASE })
  }
}
