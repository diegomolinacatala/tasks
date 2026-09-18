import type { Action } from '../state/actions'
import { reducer } from '../state/reducer'
import type { AppState, IsoDate, IsoTime, Place, ReminderDraft, TaskDraft } from '../types'
import { isValidTime, toIso } from './date'
import { parseSpoken } from './parse'
import { MAX_PLACE_NAME, findPlace, placeKey } from './places'
import { MAX_REMINDERS, normalizeReminder } from './reminders'

/**
 * Bandeja de tareas creadas fuera de la web (Siri, Atajos) mientras la app no está delante. El lado
 * nativo apunta cada alta como una entrada y la web la aplica al cargar o al volver a primer plano:
 * así la web sigue siendo la única que escribe el estado. Aplicar es idempotente (por id), así que
 * una entrada puede leerse más de una vez sin duplicar nada.
 */

/** Tope de entradas sin aplicar: el lado nativo deja de apuntar al llegar aquí. */
export const MAX_INBOX_ENTRIES = 200
/** Evento de `window`: hay entradas nuevas en la bandeja (la app estaba abierta al apuntarlas). */
export const INBOX_EVENT = 'tasks:inbox'
/**
 * Escrituras del estado sin las tareas de una entrada aplicada tras las que se da por resuelta:
 * la primera pudo empezar antes de aplicarla; si tampoco están en la siguiente, se descartaron
 * o se borraron enseguida y no hay que volver a aplicarla.
 */
const SAVES_TO_SETTLE = 2
const MAX_TASKS_PER_ENTRY = 10
const MAX_ID = 100
const MAX_TITLE = 500
const MAX_TEXT = 500
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

export interface InboxPlace {
  id: string
  name: string
}

export interface InboxTask {
  id: string
  title: string
  date: IsoDate | null
  time: IsoTime | null
  reminders: ReminderDraft[]
}

export interface InboxEntry {
  id: string
  createdAt: number
  /** Lugares que nombró lo dictado y no estaban guardados: nacen sin ubicación. */
  places: InboxPlace[]
  tasks: InboxTask[]
  /**
   * Solo lo dicho, sin interpretar: el lado nativo no pudo ejecutar su copia de esta lógica. Se
   * interpreta al aplicar la entrada (`resolveEntry`).
   */
  text?: string
}

export interface InboxApplied {
  state: AppState
  /** Lo que hay que despachar para llegar a `state`. Vacío si ya estaban aplicadas. */
  actions: Action[]
  /** Las entradas tal como se aplicaron (las de solo texto, ya interpretadas). */
  entries: InboxEntry[]
}

/** Convierte lo entendido en una entrada. Un lugar nuevo se crea una sola vez aunque lo nombren varias tareas. */
export function entryFromDrafts(drafts: readonly TaskDraft[], places: readonly Place[], newId: () => string, now: number): InboxEntry {
  const created = new Map<string, InboxPlace>()

  const tasks = drafts.map((draft): InboxTask => {
    let reminders = draft.reminders
    if (draft.newPlace) {
      const key = placeKey(draft.newPlace.name)
      const saved = findPlace(places, draft.newPlace.name)
      let placeId = saved?.id ?? created.get(key)?.id
      if (!placeId) {
        placeId = newId()
        created.set(key, { id: placeId, name: draft.newPlace.name })
      }
      reminders = [...reminders, { kind: 'place', placeId, on: draft.newPlace.on }]
    }
    return { id: newId(), title: draft.title, date: draft.date, time: draft.time, reminders }
  })

  return { id: newId(), createdAt: now, places: [...created.values()], tasks }
}

export const entryTaskIds = (entry: InboxEntry): string[] => entry.tasks.map((task) => task.id)

/**
 * Una entrada de solo texto se interpreta con la hora a la que se dijo ("mañana" es el día
 * siguiente a dictarlo, no a abrir la app) y con ids derivados del suyo: releerla no duplica.
 */
export function resolveEntry(entry: InboxEntry, places: readonly Place[]): InboxEntry {
  if (entry.text === undefined || entry.tasks.length || entry.places.length) return entry
  const draft = parseSpoken(entry.text, entry.createdAt, places)
  let count = 0
  const resolved = entryFromDrafts(draft.title ? [draft] : [], places, () => `${entry.id}-${++count}`, entry.createdAt)
  return { ...resolved, id: entry.id }
}

/** Aplica las entradas en orden sobre `state`. Si no cambia nada, `state` es el mismo objeto. */
export function applyInbox(state: AppState, entries: readonly InboxEntry[]): InboxApplied {
  const actions: Action[] = []
  const applied: InboxEntry[] = []
  let current = state
  const apply = (action: Action) => {
    actions.push(action)
    current = reducer(current, action)
  }

  for (const raw of entries) {
    const entry = resolveEntry(raw, current.places)
    applied.push(entry)
    // Id del lugar en la entrada → id con el que existe en el estado.
    const placeIds = new Map<string, string>()
    for (const place of entry.places) {
      const existing = current.places.find((item) => item.id === place.id) ?? findPlace(current.places, place.name)
      if (!existing) apply({ type: 'place/add', id: place.id, name: place.name })
      placeIds.set(place.id, existing?.id ?? place.id)
    }

    for (const task of entry.tasks) {
      if (current.tasks.some((item) => item.id === task.id)) continue
      // Un aviso de un lugar que ya no existe (o que no se pudo crear) no podría sonar nunca.
      const reminders = task.reminders.flatMap((reminder): ReminderDraft[] => {
        if (reminder.kind !== 'place') return [reminder]
        const placeId = placeIds.get(reminder.placeId) ?? reminder.placeId
        return current.places.some((item) => item.id === placeId) ? [{ ...reminder, placeId }] : []
      })
      apply({ type: 'task/add', id: task.id, title: task.title, date: task.date, time: task.time, reminders, sectionId: null })
    }
  }

  return { state: current, actions, entries: applied }
}

/** Entrada ya aplicada que sigue en la bandeja hasta que el estado que la contiene esté en disco. */
export interface AwaitingEntry {
  entry: InboxEntry
  /** Escrituras que ya se han visto sin sus tareas. */
  misses: number
}

/**
 * Tras escribir `saved` en el fichero: qué entradas pueden borrarse ya de la bandeja (`settled`) y
 * cuáles siguen esperando. Borrarlas antes de tiempo perdería la tarea si la app se cierra ahí.
 */
export function settleSaved(awaiting: readonly AwaitingEntry[], saved: AppState): { settled: string[]; awaiting: AwaitingEntry[] } {
  const ids = new Set(saved.tasks.map((task) => task.id))
  const settled: string[] = []
  const rest: AwaitingEntry[] = []
  for (const item of awaiting) {
    const inSaved = entryTaskIds(item.entry).every((id) => ids.has(id))
    const misses = item.misses + 1
    if (inSaved || misses >= SAVES_TO_SETTLE) settled.push(item.entry.id)
    else rest.push({ ...item, misses })
  }
  return { settled, awaiting: rest }
}

// --- Validación: la bandeja es un fichero que escribe el lado nativo ---

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null

const isId = (value: unknown): value is string => typeof value === 'string' && value.length > 0 && value.length <= MAX_ID

function isRealDate(value: unknown): value is IsoDate {
  if (typeof value !== 'string' || !DATE_RE.test(value)) return false
  const [y = 0, m = 1, d = 1] = value.split('-').map(Number)
  return toIso(new Date(y, m - 1, d)) === value
}

/** Mismo saneado que los recordatorios guardados, sin el id (lo pone el reducer al crear la tarea). */
function parseReminder(raw: unknown): ReminderDraft[] {
  const reminder = isObject(raw) ? normalizeReminder({ ...raw, id: 'borrador' }) : null
  if (!reminder) return []
  const { id: _id, ...draft } = reminder
  return [draft]
}

function parsePlace(raw: unknown): InboxPlace[] {
  if (!isObject(raw) || !isId(raw.id) || typeof raw.name !== 'string') return []
  const name = raw.name.replace(/\s+/g, ' ').trim().slice(0, MAX_PLACE_NAME)
  return name ? [{ id: raw.id, name }] : []
}

function parseTask(raw: unknown): InboxTask[] {
  if (!isObject(raw) || !isId(raw.id) || typeof raw.title !== 'string') return []
  const title = raw.title.replace(/\s+/g, ' ').trim().slice(0, MAX_TITLE)
  if (!title) return []
  const reminders = Array.isArray(raw.reminders) ? raw.reminders.flatMap(parseReminder).slice(0, MAX_REMINDERS) : []
  return [
    {
      id: raw.id,
      title,
      date: isRealDate(raw.date) ? raw.date : null,
      time: isValidTime(raw.time) ? raw.time : null,
      reminders,
    },
  ]
}

function parseEntry(raw: unknown): InboxEntry[] {
  if (!isObject(raw) || !isId(raw.id) || typeof raw.createdAt !== 'number' || !Number.isFinite(raw.createdAt)) return []
  const places = Array.isArray(raw.places) ? raw.places.flatMap(parsePlace) : []
  const tasks = Array.isArray(raw.tasks) ? raw.tasks.flatMap(parseTask).slice(0, MAX_TASKS_PER_ENTRY) : []
  const text = typeof raw.text === 'string' ? raw.text.replace(/\s+/g, ' ').trim().slice(0, MAX_TEXT) : ''
  const entry = { id: raw.id, createdAt: raw.createdAt, places, tasks }
  return [text ? { ...entry, text } : entry]
}

/** Entradas de la bandeja tal como las guarda el lado nativo. Lo mal formado se descarta. */
export function parseInbox(raw: unknown): InboxEntry[] {
  if (!Array.isArray(raw)) return []
  return raw.flatMap(parseEntry).slice(0, MAX_INBOX_ENTRIES)
}
