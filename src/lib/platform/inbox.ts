import type { AppState } from '../../types'
import type { AwaitingEntry, InboxEntry } from '../inbox'
import { parseInbox, settleSaved } from '../inbox'
import { TasksNative } from './native'

/**
 * Bandeja de Siri y Atajos en el iPhone (`InboxStore.swift`). Una entrada aplicada no se borra al
 * leerla, sino cuando el estado que la contiene ya está en el fichero: si la app se cierra entre
 * medias, al volver se aplica otra vez (sin duplicar, por id). Mientras tanto no se relee.
 */
let awaiting: AwaitingEntry[] = []
/** Resueltas cuyo borrado de la bandeja falló: se reintenta en la siguiente escritura. */
let unacked: string[] = []

/** Entradas por aplicar, sin las que ya se aplicaron en esta sesión. */
export async function readInbox(): Promise<InboxEntry[]> {
  const { entries } = await TasksNative.inbox()
  const seen = new Set([...awaiting.map((item) => item.entry.id), ...unacked])
  return parseInbox(entries).filter((entry) => !seen.has(entry.id))
}

/** Llamar tras aplicarlas al estado. */
export function markApplied(entries: readonly InboxEntry[]): void {
  awaiting = [...awaiting, ...entries.map((entry) => ({ entry, misses: 0 }))]
}

/** Llamar tras escribir `saved` en el fichero de estado. Las escrituras llegan en serie. */
export async function settleInbox(saved: AppState): Promise<void> {
  if (!awaiting.length && !unacked.length) return
  const next = settleSaved(awaiting, saved)
  awaiting = next.awaiting
  const ids = [...unacked, ...next.settled]
  if (!ids.length) return
  unacked = ids
  await TasksNative.ackInbox({ ids })
  unacked = unacked.filter((id) => !ids.includes(id))
}
