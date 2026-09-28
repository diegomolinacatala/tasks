/** Lo que tardan el fundido de #boot (index.html) y la entrada de la app (`.is-entering`, shell.css). */
const BOOT_EXIT_MS = 760

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
