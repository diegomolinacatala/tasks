/** Lo que tardan el fundido de #boot (index.html) y la entrada de la app (`.is-entering`, shell.css). */
const BOOT_EXIT_MS = 760

/**
 * El trazo de la señal (caja de 100 × 100), tal como lo deja `scripts/brand.mjs` en el #boot de
 * `index.html`. Se lee al cargar, antes de que #boot se retire: la bienvenida dibuja la misma señal.
 */
export const MARK_PATH: string = typeof document === 'undefined' ? '' : (document.querySelector('#boot path')?.getAttribute('d') ?? '')

/**
 * La app ya está pintada debajo de #boot: la pantalla de arranque se funde y la app entra por
 * debajo. Solo la primera vez; las siguientes no hace nada.
 */
export function finishBoot(): void {
  const boot = document.getElementById('boot')
  if (!boot || boot.classList.contains('is-done')) return
  const root = document.documentElement
  // Un fotograma después: la primera pintura de la app ya está hecha debajo de #boot.
  requestAnimationFrame(() => {
    root.classList.add('is-entering')
    boot.classList.add('is-done')
    window.setTimeout(() => {
      boot.remove()
      root.classList.remove('is-entering')
    }, BOOT_EXIT_MS)
  })
}
