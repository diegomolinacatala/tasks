import { useSyncExternalStore } from 'react'
import type { StoreRelease } from '../../lib/update'

/**
 * La versión nueva de la App Store, si la hay: la encuentra `UpdatePrompt` y la enseñan su ficha y la fila
 * de Ajustes (también después de decir "Ahora no").
 */
let available: StoreRelease | null = null
const listeners = new Set<() => void>()

export function setAvailableUpdate(release: StoreRelease | null): void {
  if (release?.version === available?.version) return
  available = release
  listeners.forEach((listener) => listener())
}

const subscribe = (listener: () => void) => {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export const useAvailableUpdate = (): StoreRelease | null => useSyncExternalStore(subscribe, () => available)
