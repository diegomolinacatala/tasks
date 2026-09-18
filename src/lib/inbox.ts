import type { Action } from '../state/actions'
import { reducer } from '../state/reducer'
import type { AppState, IsoDate, IsoTime, Place, ReminderDraft, TaskDraft } from '../types'
import { parseSpoken } from './parse'
import { findPlace, placeKey } from './places'

/**
 * Bandeja de tareas creadas fuera de la web (Siri, Atajos) mientras la app no está delante. El lado
 * nativo apunta cada alta como una entrada y la web la aplica al cargar o al volver a primer plano:
 * así la web sigue siendo la única que escribe el estado. Aplicar es idempotente (por id), así que
 * una entrada puede leerse más de una vez sin duplicar nada. El fichero en sí: `inboxFile.ts`.
 */

/** Tope de entradas sin aplicar: el lado nativo deja de apuntar al llegar aquí. */
export const MAX_INBOX_ENTRIES = 200
/** Evento de `window`: hay entradas nuevas en la bandeja (la app estaba abierta al apuntarlas). */
export const INBOX_EVENT = 'tasks:inbox'

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
