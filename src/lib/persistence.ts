import { get, set } from 'idb-keyval'
import { seedState } from '../state/seed'
import type { AppState } from '../types'
import { normalizeState } from './backup'
import { applyInbox } from './inbox'
import { isNative } from './platform'

const KEY = 'tasks:state:v1'

async function loadFromBrowser(): Promise<AppState | null> {
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

/**
 * iPhone: lo apuntado con Siri o Atajos con la app cerrada entra al cargar, antes de pintar nada.
 * Así, tocar el aviso de una de esas tareas ya la encuentra.
 */
async function withInbox(state: AppState | null): Promise<AppState | null> {
  try {
    const { markApplied, readInbox } = await import('./platform/inbox')
    const entries = await readInbox()
    if (!entries.length) return state
    const applied = applyInbox(state ?? seedState(), entries)
    markApplied(applied.entries)
    return applied.state
  } catch {
    // Sin bandeja se carga igual: `NativeInbox` vuelve a mirarla al volver a primer plano.
    return state
  }
}

/** En el iPhone manda el fichero; IndexedDB primero en la web; localStorage como red de seguridad. */
export async function loadState(): Promise<AppState | null> {
  if (!isNative) return loadFromBrowser()
  const { readStateFile } = await import('./platform/storage')
  const stored = normalizeState(await readStateFile()) ?? (await loadFromBrowser())
  return withInbox(stored)
}

async function saveToBrowser(state: AppState): Promise<void> {
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

async function saveToFile(state: AppState): Promise<boolean> {
  try {
    const { writeStateFile } = await import('./platform/storage')
    await writeStateFile(JSON.stringify(state))
    return true
  } catch {
    // Queda la copia del WebView: al arrancar se usa si el fichero falta.
    console.error('No se pudo guardar el fichero de estado.')
    return false
  }
}

export async function saveState(state: AppState): Promise<void> {
  if (isNative && (await saveToFile(state))) {
    // Lo aplicado de la bandeja ya está a salvo en el fichero: puede salir de ella. Si el borrado
    // falla, se reintenta en la siguiente escritura.
    await import('./platform/inbox').then(({ settleInbox }) => settleInbox(state)).catch(() => undefined)
  }
  await saveToBrowser(state)
}

export interface Persister {
  save: (state: AppState) => void
  flush: () => void
}

/**
 * Agrupa escrituras seguidas y permite forzarlas antes de que el sistema mate la pestaña. Las
 * escrituras van en serie: si una lenta terminara después de otra más reciente, en disco quedaría
 * el estado viejo (y en el iPhone el fichero manda al arrancar).
 */
export function createPersister(delay = 250): Persister {
  let timer: ReturnType<typeof setTimeout> | undefined
  let pending: AppState | null = null
  let writing: Promise<void> = Promise.resolve()

  const write = () => {
    if (timer) clearTimeout(timer)
    timer = undefined
    if (!pending) return
    const state = pending
    pending = null
    writing = writing.then(() => saveState(state))
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
