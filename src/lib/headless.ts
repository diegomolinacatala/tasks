import { emptyState, reducer } from '../state/reducer'
import type { AppState } from '../types'
import { normalizeState } from './backup'
import { isoOfInstant, timeOfInstant } from './date'
import type { InboxEntry } from './inbox'
import { applyInbox, entryFromDrafts } from './inbox'
import { parseInbox } from './inboxFile'
import { draftsFromInterpreted } from './interpret'
import { parseWidgetChanges } from './nativeEvents'
import type { NativePlan } from './nativeSchedule'
import { nativePlan } from './nativeSchedule'
import type { ParsedTask } from './parse'
import { parseSpoken } from './parse'
import { badgeCount } from './schedule'
import type { WidgetSnapshot } from './widget'
import { widgetSnapshot, widgetToggles } from './widget'

/**
 * Apuntar una tarea sin abrir la app (Siri, Atajos). Lo ejecuta el lado nativo con JavaScriptCore
 * (`src/headless.ts`): es la misma lógica que la web, sin React ni navegador. No escribe nada; dice
 * qué entrada añadir a la bandeja y cómo dejar los avisos, el icono y el widget contando con ella.
 */

export interface HeadlessInput {
  now: number
  text: string
  /** Tareas que entendió la IA del servidor, sin validar; `null` si no hubo. */
  interpreted: unknown
  /** Contenido del fichero de estado de la app; `null` si aún no existe o no se pudo leer. */
  state: unknown
  /** Entradas de la bandeja que la web aún no ha aplicado. */
  inbox: unknown
  /** Lo marcado desde el widget que la web aún no ha aplicado (`[{ taskId, done }]`). */
  widgetChanges: unknown
}

export interface HeadlessResult {
  /** Lo que hay que añadir a la bandeja; `null` si no se entendió nada. */
  entry: InboxEntry | null
  /** Lo que dice Siri o el atajo al terminar. */
  message: string
  /** `null` = no tocar: sin el estado guardado no se sabe qué más hay programado. */
  plan: NativePlan | null
  badge: number | null
  widget: WidgetSnapshot | null
}

/** Fecha y hora locales para que la IA resuelva "mañana" o "a las 5", como al dictar en la app. */
export const voiceContext = (now: number) => ({ today: isoOfInstant(now), now: timeOfInstant(now) })

/** Lo que la web tendrá cuando aplique lo pendiente: el fichero, más la bandeja, más el widget. */
function projected(saved: AppState, inbox: unknown, widgetChanges: unknown): AppState {
  const { state } = applyInbox(saved, parseInbox(inbox))
  return widgetToggles(state.tasks, parseWidgetChanges(widgetChanges)).reduce(
    (acc, id) => reducer(acc, { type: 'task/toggle', id }),
    state,
  )
}

/** `Hoy 20:00 · 30 min antes` → `hoy 20:00, 30 min antes`: va detrás de una coma y se lee en voz alta. */
const spoken = (label: string) => label.charAt(0).toLowerCase() + label.slice(1).replaceAll(' · ', ', ')

function summary(drafts: readonly ParsedTask[], entry: InboxEntry): string {
  const [first] = drafts
  const added =
    drafts.length === 1 && first
      ? `Apuntada: ${first.title}, ${first.label ? spoken(first.label) : 'sin fecha'}.`
      : `Apuntadas ${drafts.length} tareas: ${drafts.map((draft) => draft.title).join(', ')}.`
  const missing = entry.places.map((place) => place.name).join(' y ')
  // Sin ubicación el aviso no puede sonar; en la app se abriría el editor del lugar.
  return missing ? `${added} Abre Tasks para decir dónde está ${missing}.` : added
}

export function addFromText(input: HeadlessInput, newId: () => string): HeadlessResult {
  const saved = normalizeState(input.state)
  const state = projected(saved ?? emptyState(), input.inbox, input.widgetChanges)
  const { now, text } = input

  // Lo que entendió la IA manda; si no hay nada válido, el analizador local (como en la app).
  const drafts = draftsFromInterpreted(input.interpreted, now, state.places) ?? [parseSpoken(text, now, state.places)].filter((draft) => draft.title)
  if (!drafts.length) return { entry: null, message: 'No te he entendido.', plan: null, badge: null, widget: null }

  const entry = entryFromDrafts(drafts, state.places, newId, now)
  const message = summary(drafts, entry)
  if (!saved) return { entry, message, plan: null, badge: null, widget: null }

  const next = applyInbox(state, [entry]).state
  return { entry, message, plan: nativePlan(next, now), badge: badgeCount(next.tasks, now), widget: widgetSnapshot(next, now) }
}
