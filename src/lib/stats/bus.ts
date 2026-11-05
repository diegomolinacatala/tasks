import type { Action } from '../../state/actions'
import { actionEvents } from './events'

/**
 * La parte de las estadísticas que va en el JS principal: una cola corta. El recolector
 * (`collector.ts`) va en su propio trozo y se engancha al cargarse; hasta entonces, lo que pase se
 * guarda aquí. Con las estadísticas apagadas, nada se guarda.
 */

export type StatsSignal = { kind: 'event'; name: string; n: number } | { kind: 'boot'; ms: number }

type Sink = (signal: StatsSignal) => void

const MAX_QUEUE = 300

let sink: Sink | null = null
let enabled = true
let queue: StatsSignal[] = []

function emit(signal: StatsSignal) {
  if (!enabled) return
  if (sink) sink(signal)
  else if (queue.length < MAX_QUEUE) queue = [...queue, signal]
}

/**
 * Cada acción del reducer (`StoreProvider`): se queda solo con su tipo y su forma (`actionEvents`), nunca
 * con la acción entera, que lleva el contenido (títulos, nombres).
 */
export function trackAction(action: Action): void {
  if (!enabled) return
  for (const name of actionEvents(action)) emit({ kind: 'event', name, n: 1 })
}

/** Algo que no pasa por el reducer: una pestaña vista, un dictado, una píldora rechazada… */
export const track = (name: string, n = 1): void => emit({ kind: 'event', name, n })

/** Lo que tardó la app en pintarse desde que se cargó la página (solo la primera vez). */
export const trackBoot = (ms: number): void => emit({ kind: 'boot', ms })

/** El recolector se engancha y recibe lo que esperaba en la cola. */
export function attach(next: Sink): () => void {
  sink = next
  const waiting = queue
  queue = []
  waiting.forEach(next)
  return () => {
    if (sink === next) sink = null
  }
}

/** Con las estadísticas apagadas no se guarda ni lo que espera. */
export function setCollecting(on: boolean): void {
  enabled = on
  if (!on) queue = []
}
