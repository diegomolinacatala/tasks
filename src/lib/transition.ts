import { flushSync } from 'react-dom'

type WithViewTransition = Document & {
  startViewTransition?: (callback: () => void) => { finished: Promise<void> }
}

/** Transición nativa entre vistas; si el navegador no la soporta, cambia sin más. */
export function withTransition(update: () => void): void {
  const doc = document as WithViewTransition
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches

  if (!doc.startViewTransition || reduced) {
    update()
    return
  }

  // `finished` rechaza si otra transición la interrumpe: no es un error que deba propagarse.
  doc.startViewTransition(() => flushSync(update)).finished.catch(() => {})
}
