/**
 * Qué hay delante de la app: cada panel abierto se apunta aquí. Con alguno abierto, `<html>` lleva
 * `has-sheet` (el toast se pone arriba para no quedar bajo el panel) y la app de debajo va `inert`
 * (el foco y el lector de pantalla se quedan en el panel). La bienvenida y la tarjeta de sugerencias
 * viven fuera de `.app`, así que siguen funcionando con un panel abierto.
 */
let open = 0

const app = () => document.querySelector<HTMLElement>('.app')

/**
 * `popover`: una capa que deja el pie libre (la cesta): el toast se queda abajo, donde siempre, en vez
 * de subir arriba, que es donde está el propio popover.
 */
export function acquireModal(kind: 'sheet' | 'popover' = 'sheet') {
  open += 1
  if (open > 1) return
  document.documentElement.classList.add(kind === 'popover' ? 'has-popover' : 'has-sheet')
  app()?.setAttribute('inert', '')
}

export function releaseModal() {
  open = Math.max(0, open - 1)
  if (open > 0) return
  document.documentElement.classList.remove('has-sheet', 'has-popover')
  // La bienvenida pone el suyo por React: si está abierta no se le quita.
  const node = app()
  if (node && !node.dataset.welcome) node.removeAttribute('inert')
}
