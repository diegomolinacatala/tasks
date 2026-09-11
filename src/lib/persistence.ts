import { get, set } from 'idb-keyval'
import type { AppState } from '../types'
import { normalizeState } from './backup'

const KEY = 'tasks:state:v1'

/** IndexedDB primero; localStorage como red de seguridad (modo privado, permisos). */
export async function loadState(): Promise<AppState | null> {
  try {
    const stored = normalizeState(await get(KEY))
    if (stored) return stored
  } catch {
    /* seguimos con el fallback */
  }
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? normalizeState(JSON.parse(raw)) : null
  } catch {
    return null
  }
}

export async function saveState(state: AppState): Promise<void> {
  try {
    await set(KEY, state)
    return
  } catch {
    /* seguimos con el fallback */
  }
  try {
    localStorage.setItem(KEY, JSON.stringify(state))
  } catch {
    console.error('No se pudo guardar el estado: almacenamiento no disponible.')
  }
}

export interface Persister {
  save: (state: AppState) => void
  flush: () => void
}

/** Agrupa escrituras seguidas y permite forzarlas antes de que el sistema mate la pestaña. */
export function createPersister(delay = 250): Persister {
  let timer: ReturnType<typeof setTimeout> | undefined
  let pending: AppState | null = null

  const write = () => {
    if (timer) clearTimeout(timer)
    timer = undefined
    if (!pending) return
    const state = pending
    pending = null
    void saveState(state)
  }

  return {
    save(state) {
      pending = state
      if (timer) clearTimeout(timer)
      timer = setTimeout(write, delay)
    },
    flush: write,
  }
}
