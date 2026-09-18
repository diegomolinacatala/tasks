import { flushSync } from 'react-dom'

type WithViewTransition = Document & {
  startViewTransition?: (callback: () => void) => { ready: Promise<void>; finished: Promise<void> }
}

/** Transición nativa entre vistas; si el navegador no la soporta, cambia sin más. */
export function withTransition(update: () => void): void {
  const doc = document as WithViewTransition
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches

  if (!doc.startViewTransition || reduced) {
    update()
    return
  }

  // `ready` y `finished` rechazan si la transición se salta (página oculta) o la interrumpe otra:
  // el cambio de vista ya se ha hecho igual, no es un error que deba propagarse.
  const transition = doc.startViewTransition(() => flushSync(update))
  transition.ready.catch(() => {})
  transition.finished.catch(() => {})
}
