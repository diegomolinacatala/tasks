import type { AppState, Reminder, Section, Settings, Task } from '../types'
import { SCHEMA_VERSION, defaultSettings } from '../state/reducer'
import { isValidTime } from './date'
import { MAX_REMINDERS, normalizeReminder } from './reminders'

export interface BackupFile {
  app: 'tasks'
  schemaVersion: number
  exportedAt: string
  state: AppState
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

const str = (value: unknown, fallback = '') => (typeof value === 'string' ? value : fallback)
const num = (value: unknown, fallback = 0) => (typeof value === 'number' && Number.isFinite(value) ? value : fallback)

function normalizeReminders(raw: unknown): Reminder[] {
  if (!Array.isArray(raw)) return []
  const seen = new Set<string>()
  return raw
    .map(normalizeReminder)
    .filter((reminder): reminder is Reminder => {
      if (!reminder || seen.has(reminder.id)) return false
      seen.add(reminder.id)
      return true
    })
    .slice(0, MAX_REMINDERS)
}

function normalizeTask(raw: unknown): Task | null {
  if (!isObject(raw)) return null
  const id = str(raw.id)
  const title = str(raw.title)
  if (!id || !title) return null
  return {
    id,
    title,
    done: raw.done === true,
    date: typeof raw.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(raw.date) ? raw.date : null,
    time: isValidTime(raw.time) ? raw.time : null,
    reminders: normalizeReminders(raw.reminders),
    sectionId: typeof raw.sectionId === 'string' ? raw.sectionId : null,
    order: num(raw.order),
    createdAt: num(raw.createdAt, Date.now()),
    completedAt: typeof raw.completedAt === 'number' ? raw.completedAt : null,
  }
}

function normalizeSection(raw: unknown): Section | null {
  if (!isObject(raw)) return null
  const id = str(raw.id)
  const name = str(raw.name)
  if (!id || !name) return null
  return { id, name, order: num(raw.order), collapsed: raw.collapsed === true }
}

function normalizeSettings(raw: unknown): Settings {
  const defaults = defaultSettings()
  const digest = isObject(raw) && isObject(raw.digest) ? raw.digest : {}
  return {
    digest: {
      enabled: digest.enabled === true,
      time: isValidTime(digest.time) ? digest.time : defaults.digest.time,
    },
  }
}

/** Acepta tanto el fichero de backup como un AppState suelto. */
export function normalizeState(raw: unknown): AppState | null {
  if (!isObject(raw)) return null
  const candidate = isObject(raw.state) ? raw.state : raw
  if (!Array.isArray(candidate.tasks) || !Array.isArray(candidate.sections)) return null

  const sections = candidate.sections.map(normalizeSection).filter((s): s is Section => s !== null)
  const known = new Set(sections.map((section) => section.id))
  const tasks = candidate.tasks
    .map(normalizeTask)
    .filter((task): task is Task => task !== null)
    .map((task) => (task.sectionId && !known.has(task.sectionId) ? { ...task, sectionId: null } : task))

  const collapsed = isObject(candidate.collapsed) ? candidate.collapsed : {}

  // Normalizar es migrar: lo que sale de aquí cumple ya el esquema actual.
  return {
    schemaVersion: SCHEMA_VERSION,
    tasks,
    sections,
    collapsed: { overdue: collapsed.overdue === true, backlog: collapsed.backlog === true },
    settings: normalizeSettings(candidate.settings),
  }
}

export function serializeBackup(state: AppState, now: Date = new Date()): string {
  const file: BackupFile = {
    app: 'tasks',
    schemaVersion: SCHEMA_VERSION,
    exportedAt: now.toISOString(),
    state,
  }
  return JSON.stringify(file, null, 2)
}

export function parseBackup(text: string): AppState {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    throw new Error('El fichero no es JSON válido.')
  }
  const state = normalizeState(raw)
  if (!state) throw new Error('El fichero no tiene el formato de una copia de Tasks.')
  return state
}

export function backupFilename(now: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `tasks-${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}.json`
}
