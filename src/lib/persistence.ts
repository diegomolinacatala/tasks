import { get, set } from 'idb-keyval'
import { emptyState } from '../state/reducer'
import type { AppState } from '../types'
import { normalizeState } from './backup'
import { deviceLanguages, resolveLanguage, setLanguage } from './i18n'
import { applyInbox } from './inbox'
import { loadEnglish } from './parse'
import { isNative } from './platform'

const KEY = 'tasks:state:v1'
/** Cuándo se guardó cada copia: en el iPhone manda la más reciente, no el fichero por ser fichero. */
const SAVED_AT_KEY = 'tasks:state:savedAt'
/** Se avisa al segundo fallo seguido: uno suelto (la pestaña muriendo) no dice nada. */
const FAILURES_BEFORE_WARNING = 2
/** Lo escucha la app para avisar de que no se está guardando. */
export const SAVE_FAILED_EVENT = 'tasks:save-failed'

interface Stored {
  state: AppState
  savedAt: number
}

const stamped = (raw: unknown, savedAt: number): Stored | null => {
  const state = normalizeState(raw)
  return state ? { state, savedAt } : null
}

async function loadFromBrowser(): Promise<Stored | null> {
  try {
    const stored = stamped(await get(KEY), Number(await get(SAVED_AT_KEY)) || 0)
    if (stored) return stored
  } catch {
    /* seguimos con el fallback */
  }
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? stamped(JSON.parse(raw), Number(localStorage.getItem(SAVED_AT_KEY)) || 0) : null
  } catch {
    return null
  }
}

/**
 * iPhone: lo apuntado con Siri o Atajos con la app cerrada entra al cargar, antes de pintar nada.
 * Así, tocar el aviso de una de esas tareas ya la encuentra.
 */
async function withInbox(state: AppState): Promise<AppState> {
  try {
    const { markApplied, readInbox } = await import('./platform/inbox')
    const entries = await readInbox()
    if (!entries.length) return state
    // Una entrada de solo texto se interpreta aquí, antes de que la app fije su idioma: se fija ya.
    const language = resolveLanguage(state.settings.language, deviceLanguages())
    setLanguage(language)
    if (language === 'en') await loadEnglish()
    const applied = applyInbox(state, entries)
    markApplied(applied.entries)
    return applied.state
  } catch {
    // Sin bandeja se carga igual: `NativeInbox` vuelve a mirarla al volver a primer plano.
    return state
  }
}

export interface Loaded {
  state: AppState
  /** No había nada guardado: es la primera vez que se abre (y toca la bienvenida). */
  fresh: boolean
}

/**
 * En la web, IndexedDB y localStorage como red de seguridad. En el iPhone, el fichero y la copia del
 * WebView: se queda la más reciente (si el fichero dejó de escribirse, la del WebView va por delante).
 */
export async function loadState(): Promise<Loaded> {
  if (!isNative) {
    const stored = await loadFromBrowser()
    return { state: stored?.state ?? emptyState(), fresh: stored === null }
  }
  const { readStateFile } = await import('./platform/storage')
  const raw = await readStateFile()
  const file = typeof raw === 'object' && raw !== null && 'savedAt' in raw ? stamped(raw, Number(raw.savedAt) || 0) : stamped(raw, 0)
  const browser = await loadFromBrowser()
  const stored = file && browser ? (browser.savedAt > file.savedAt ? browser : file) : (file ?? browser)
  return { state: await withInbox(stored?.state ?? emptyState()), fresh: stored === null }
}

let failures = 0

/** Dos escrituras seguidas que fallan: la app avisa (lo hecho desde entonces se perdería al cerrar). */
function noteFailure(): void {
  failures += 1
  if (failures === FAILURES_BEFORE_WARNING && typeof window !== 'undefined') window.dispatchEvent(new Event(SAVE_FAILED_EVENT))
}

async function saveToBrowser(state: AppState, savedAt: number): Promise<boolean> {
  try {
    await set(KEY, state)
    await set(SAVED_AT_KEY, savedAt)
    return true
  } catch {
    /* seguimos con el fallback */
  }
  try {
    localStorage.setItem(KEY, JSON.stringify(state))
    localStorage.setItem(SAVED_AT_KEY, String(savedAt))
    return true
  } catch {
    return false
  }
}

async function saveToFile(state: AppState, savedAt: number): Promise<boolean> {
  try {
    const { writeStateFile } = await import('./platform/storage')
    await writeStateFile(JSON.stringify({ ...state, savedAt }))
    return true
  } catch {
    // Queda la copia del WebView, que al arrancar gana por ser más reciente.
    return false
  }
}

export async function saveState(state: AppState): Promise<void> {
  const savedAt = Date.now()
  const inFile = isNative && (await saveToFile(state, savedAt))
  if (inFile) {
    // Lo aplicado de la bandeja ya está a salvo en el fichero: puede salir de ella. Si el borrado
    // falla, se reintenta en la siguiente escritura.
    await import('./platform/inbox').then(({ settleInbox }) => settleInbox(state)).catch(() => undefined)
  }
  const inBrowser = await saveToBrowser(state, savedAt)
  if (inFile || (!isNative && inBrowser)) failures = 0
  else noteFailure()
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
