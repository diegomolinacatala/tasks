import type { AppState, Place, Reminder, Routine, Section, Settings, Task, Theme } from '../types'
import { SCHEMA_VERSION, THEMES, defaultSettings } from '../state/reducer'
import { MAX_ROUTINES, normalizeRoutine } from './routines'
import { isValidTime } from './date'
import { normalizeDuration } from './duration'
import { normalizeImportance } from './importance'
import { cleanUntil } from './period'
import { MAX_PLACES, cleanAliases, normalizePlace, placeKey } from './places'
import { MAX_REMINDERS, normalizeReminder } from './reminders'
import { isLanguageSetting, pick } from './i18n'
import { normalizeWelcome } from './welcome'

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
  const date = typeof raw.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(raw.date) ? raw.date : null
  return {
    id,
    title,
    done: raw.done === true,
    date,
    // Las copias anteriores a los plazos no lo traen: solo su día.
    until: cleanUntil(date, raw.until),
    time: isValidTime(raw.time) ? raw.time : null,
    // Las copias anteriores a la duración no la traen: quedan sin aviso de cierre.
    duration: normalizeDuration(raw.duration),
    reminders: normalizeReminders(raw.reminders),
    // Sin fecha no hay sección: las secciones agrupan dentro del día.
    sectionId: date && typeof raw.sectionId === 'string' ? raw.sectionId : null,
    order: num(raw.order),
    // Las copias anteriores a la importancia no la traen: quedan a tamaño normal.
    importance: normalizeImportance(raw.importance),
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
  const settings = isObject(raw) ? raw : {}
  const digest = isObject(settings.digest) ? settings.digest : {}
  return {
    digest: {
      enabled: digest.enabled === true,
      time: isValidTime(digest.time) ? digest.time : defaults.digest.time,
    },
    dictation: settings.dictation === true,
    // Las copias anteriores al modo oscuro no lo traen: siguen al sistema.
    theme: THEMES.includes(settings.theme as Theme) ? (settings.theme as Theme) : defaults.theme,
    // Lo guardado antes del inglés se usaba en español: sigue en español. Una instalación nueva no
    // pasa por aquí (empieza con el del sistema).
    language: isLanguageSetting(settings.language) ? settings.language : 'es',
    // Las copias anteriores a la bienvenida no la han visto: al actualizar, sale.
    welcome: normalizeWelcome(settings.welcome),
    // Las anteriores a la hora de inicio del día: a medianoche, como hasta ahora.
    dayStart: isValidTime(settings.dayStart) ? settings.dayStart : defaults.dayStart,
  }
}

/** Sin ids repetidos. Las copias anteriores a las rutinas no las traen. */
function normalizeRoutines(raw: unknown): Routine[] {
  if (!Array.isArray(raw)) return []
  return raw
    .map(normalizeRoutine)
    .filter((routine): routine is Routine => routine !== null)
    .reduce<Routine[]>((acc, routine) => (acc.some((other) => other.id === routine.id) ? acc : [...acc, routine]), [])
    .slice(0, MAX_ROUTINES)
}

/**
 * Sin ids ni nombres repetidos: el nombre es lo que casa con lo dictado ("al llegar a Mercadona"). Un
 * otro nombre que choque con el nombre de otro lugar, o con otro nombre de uno anterior, se descarta.
 */
function normalizePlaces(raw: unknown): Place[] {
  if (!Array.isArray(raw)) return []
  const unique = raw
    .map(normalizePlace)
    .filter((place): place is Place => place !== null)
    .reduce<Place[]>(
      (acc, place) =>
        acc.some((other) => other.id === place.id || placeKey(other.name) === placeKey(place.name)) ? acc : [...acc, place],
      [],
    )
    .slice(0, MAX_PLACES)
  return unique.reduce<Place[]>((acc, place, index) => {
    const later = unique.slice(index + 1).map((other) => ({ ...other, aliases: [] }))
    return [...acc, { ...place, aliases: cleanAliases(place.aliases, place.name, [...acc, ...later]) }]
  }, [])
}

/** Acepta tanto el fichero de backup como un AppState suelto. */
export function normalizeState(raw: unknown): AppState | null {
  if (!isObject(raw)) return null
  const candidate = isObject(raw.state) ? raw.state : raw
  if (!Array.isArray(candidate.tasks) || !Array.isArray(candidate.sections)) return null

  const sections = candidate.sections.map(normalizeSection).filter((s): s is Section => s !== null)
  const known = new Set(sections.map((section) => section.id))
  const places = normalizePlaces(candidate.places)
  const knownPlaces = new Set(places.map((place) => place.id))
  const tasks = candidate.tasks
    .map(normalizeTask)
    .filter((task): task is Task => task !== null)
    .map((task) => (task.sectionId && !known.has(task.sectionId) ? { ...task, sectionId: null } : task))
    .map((task) => {
      const reminders = task.reminders.filter((reminder) => reminder.kind !== 'place' || knownPlaces.has(reminder.placeId))
      return reminders.length === task.reminders.length ? task : { ...task, reminders }
    })

  const collapsed = isObject(candidate.collapsed) ? candidate.collapsed : {}

  // Normalizar es migrar: lo que sale de aquí cumple ya el esquema actual.
  return {
    schemaVersion: SCHEMA_VERSION,
    tasks,
    sections,
    places,
    routines: normalizeRoutines(candidate.routines),
    collapsed: { overdue: collapsed.overdue === true, backlog: collapsed.backlog === true, routines: collapsed.routines === true },
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
    throw new Error(pick({ es: 'El fichero no es JSON válido.', en: 'The file is not valid JSON.' }))
  }
  const state = normalizeState(raw)
  if (!state) throw new Error(pick({ es: 'El fichero no tiene el formato de una copia de Tasks.', en: 'The file is not a Tasks backup.' }))
  return state
}

export function backupFilename(now: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `tasks-${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}.json`
}
