import type { AppState, IsoDate, ReminderDraft } from '../types'
import { isValidTime, toIso } from './date'
import type { InboxEntry, InboxPlace, InboxTask } from './inbox'
import { MAX_INBOX_ENTRIES, entryTaskIds } from './inbox'
import { MAX_PLACE_NAME } from './places'
import { MAX_REMINDERS, normalizeReminder } from './reminders'

/**
 * El fichero de la bandeja en el iPhone (`InboxStore.swift`): validar lo que escribe el lado nativo
 * y decidir cuándo puede vaciarse. Aparte de `inbox.ts` porque la PWA no lo necesita.
 */

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
