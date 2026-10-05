import { emptyState, reducer } from '../state/reducer'
import { overdueTasks } from '../state/selectors'
import type { AppState } from '../types'
import { normalizeState } from './backup'
import { isoOfInstant, timeOfInstant } from './date'
import { extendedDuration } from './duration'
import type { Language } from './i18n'
import { language, pick, resolveLanguage, setLanguage } from './i18n'
import type { InboxAsk, InboxEntry } from './inbox'
import { applyInbox, entryFromDrafts } from './inbox'
import { parseInbox } from './inboxFile'
import { draftsFromInterpreted } from './interpret'
import { parseRoutineChanges, parseWidgetChanges } from './nativeEvents'
import type { NativePlan } from './nativeSchedule'
import { nativePlan } from './nativeSchedule'
import type { ParsedTask } from './parse'
import { parseSpoken, provideEnglish } from './parse'
import * as englishParser from './parseEn'
import { badgeCount } from './schedule'
import type { WidgetSnapshot } from './widget'
import { routineSettles, widgetSnapshot, widgetToggles } from './widget'

/**
 * Apuntar una tarea, pasar lo atrasado a hoy o responder al aviso de cierre sin abrir la app (Siri,
 * Atajos, el widget, los botones del aviso). Lo ejecuta el lado nativo con JavaScriptCore
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
  /** Idiomas de iOS (`Locale.preferredLanguages`): deciden el idioma si en la app se dejó en automático. */
  languages?: unknown
}

/** Pasar lo atrasado a hoy: lo mismo que para apuntar, sin frase. */
export type MoveInput = Omit<HeadlessInput, 'text' | 'interpreted'>

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

const TEXT = {
  es: {
    added: (title: string, when: string) => `Apuntada: ${title}, ${when}.`,
    noDate: 'sin fecha',
    addedMany: (count: number, titles: string) => `Apuntadas ${count} tareas: ${titles}.`,
    and: ' y ',
    wherePlace: (names: string) => `Abre Tasks para decir dónde está ${names}.`,
    notUnderstood: 'No te he entendido.',
    openForOverdue: 'Abre Tasks para ver lo atrasado.',
    noOverdue: 'No hay nada atrasado.',
    moved: (count: number) => (count === 1 ? '1 tarea pasada a hoy.' : `${count} tareas pasadas a hoy.`),
    openToAnswer: 'Abre Tasks para responder.',
    unknownReply: 'Respuesta desconocida.',
    nothingToChange: 'No hay nada que cambiar.',
    done: (title: string) => `Hecha: ${title}.`,
    extended: (title: string) => `Alargada: ${title}.`,
  },
  en: {
    added: (title: string, when: string) => `Added: ${title}, ${when}.`,
    noDate: 'no date',
    addedMany: (count: number, titles: string) => `Added ${count} tasks: ${titles}.`,
    and: ' and ',
    wherePlace: (names: string) => `Open Tasks to say where ${names} is.`,
    notUnderstood: 'I didn’t catch that.',
    openForOverdue: 'Open Tasks to see what’s overdue.',
    noOverdue: 'Nothing is overdue.',
    moved: (count: number) => (count === 1 ? '1 task moved to today.' : `${count} tasks moved to today.`),
    openToAnswer: 'Open Tasks to answer.',
    unknownReply: 'Unknown answer.',
    nothingToChange: 'Nothing to change.',
    done: (title: string) => `Done: ${title}.`,
    extended: (title: string) => `Extended: ${title}.`,
  },
} as const

// Siri no puede esperar a un trozo aparte: `headless.js` lleva los dos analizadores.
provideEnglish(englishParser)

const languagesOf = (raw: unknown): string[] => (Array.isArray(raw) ? raw.filter((tag): tag is string => typeof tag === 'string') : [])

/**
 * El idioma de la app para esta petición: el elegido en ella o, en automático (o si aún no se ha
 * abierto), el de iOS. Se fija antes de analizar la frase y de componer lo que dice Siri.
 */
function speakAs(saved: AppState | null, languages: unknown): Language {
  const next = resolveLanguage(saved?.settings.language ?? 'auto', languagesOf(languages))
  setLanguage(next)
  return next
}

/**
 * Si la frase de Siri puede ir a la IA del servidor: solo con el permiso dado en la app
 * (`settings.dictation`) y en español, que es lo que entiende su prompt; en inglés, el analizador
 * local. Sin fichero de estado no hay permiso, y se usa el analizador local.
 */
export function sharesDictation(state: unknown, languages: unknown = []): boolean {
  const saved = normalizeState(state)
  return saved?.settings.dictation === true && speakAs(saved, languages) === 'es'
}

/** Fecha y hora locales para que la IA resuelva "mañana" o "a las 5", como al dictar en la app. */
export const voiceContext = (now: number) => ({ today: isoOfInstant(now), now: timeOfInstant(now) })

/**
 * Lo que la web tendrá cuando aplique lo pendiente: el fichero, más la bandeja, más lo marcado en
 * los widgets (tareas y rutinas: una rutina tachada ya no debe volver a avisar hoy).
 */
function projected(saved: AppState, inbox: unknown, widgetChanges: unknown): AppState {
  const { state } = applyInbox(saved, parseInbox(inbox))
  const toggled = widgetToggles(state.tasks, parseWidgetChanges(widgetChanges)).reduce(
    (acc, id) => reducer(acc, { type: 'task/toggle', id }),
    state,
  )
  return routineSettles(toggled.routines, parseRoutineChanges(widgetChanges)).reduce(
    (acc, { routineId, date, done }) => reducer(acc, { type: 'routine/set', id: routineId, date, done }),
    toggled,
  )
}

/**
 * `Hoy 20:00 · 30 min antes` → `hoy 20:00, 30 min antes`: va detrás de una coma y se lee en voz alta.
 * En inglés solo se baja "Today" y compañía: los días de la semana van en mayúscula.
 */
function spoken(label: string): string {
  const keep = language() === 'en' && !/^(?:Today|Tomorrow|Yesterday)\b/.test(label)
  const first = keep ? label.charAt(0) : label.charAt(0).toLowerCase()
  return first + label.slice(1).replaceAll(' · ', ', ')
}

function summary(drafts: readonly ParsedTask[], entry: InboxEntry): string {
  const text = pick(TEXT)
  const [first] = drafts
  const added =
    drafts.length === 1 && first
      ? text.added(first.title, first.label ? spoken(first.label) : text.noDate)
      : text.addedMany(drafts.length, drafts.map((draft) => draft.title).join(', '))
  const missing = entry.places.map((place) => place.name).join(text.and)
  // Sin ubicación el aviso no puede sonar; en la app se abriría el editor del lugar.
  return missing ? `${added} ${text.wherePlace(missing)}` : added
}

export function addFromText(input: HeadlessInput, newId: () => string): HeadlessResult {
  const saved = normalizeState(input.state)
  const lang = speakAs(saved, input.languages)
  const state = projected(saved ?? emptyState(), input.inbox, input.widgetChanges)
  const { now, text } = input

  // Lo que entendió la IA manda; si no hay nada válido, el analizador local (como en la app). La IA
  // solo entiende español: en inglés, lo que devuelva no cuenta.
  const interpreted = lang === 'es' ? draftsFromInterpreted(input.interpreted, now, state.places, text) : null
  const drafts = interpreted ?? [parseSpoken(text, now, state.places)].filter((draft) => draft.title)
  if (!drafts.length) return { entry: null, message: pick(TEXT).notUnderstood, plan: null, badge: null, widget: null }

  const entry = entryFromDrafts(drafts, state.places, newId, now)
  const message = summary(drafts, entry)
  if (!saved) return { entry, message, plan: null, badge: null, widget: null }

  const next = applyInbox(state, [entry]).state
  return { entry, message, plan: nativePlan(next, now), badge: badgeCount(next.tasks, now), widget: widgetSnapshot(next, now) }
}

/**
 * Lo atrasado, a hoy (arriba de su sección), como el botón del bloque Atrasadas. El mensaje no dice
 * qué tareas son: se oye y se ve también con el iPhone bloqueado.
 */
export function moveOverdue(input: MoveInput, newId: () => string): HeadlessResult {
  const saved = normalizeState(input.state)
  speakAs(saved, input.languages)
  const text = pick(TEXT)
  // Sin el estado guardado no se sabe qué está atrasado.
  if (!saved) return { entry: null, message: text.openForOverdue, plan: null, badge: null, widget: null }

  const { now } = input
  const state = projected(saved, input.inbox, input.widgetChanges)
  const date = isoOfInstant(now)
  const taskIds = overdueTasks(state, date).map((task) => task.id)
  if (!taskIds.length) return { entry: null, message: text.noOverdue, plan: null, badge: null, widget: null }

  const entry: InboxEntry = { id: newId(), createdAt: now, places: [], tasks: [], move: { date, taskIds } }
  const next = applyInbox(state, [entry]).state
  return {
    entry,
    message: text.moved(taskIds.length),
    plan: nativePlan(next, now),
    badge: badgeCount(next.tasks, now),
    widget: widgetSnapshot(next, now),
  }
}

/** Responder al aviso de cierre: la tarea y el botón. */
export type AskInput = MoveInput & { taskId: unknown; reply: unknown }

const nothing = (message: string): HeadlessResult => ({ entry: null, message, plan: null, badge: null, widget: null })

/**
 * "Sí, hecha" o "Todavía no" desde el aviso de cierre, sin abrir la app. "Todavía no" vuelve a
 * programar la pregunta, con la tarea alargada como lo haría la app (`task/extend`).
 */
export function answerAsk(input: AskInput, newId: () => string): HeadlessResult {
  const saved = normalizeState(input.state)
  speakAs(saved, input.languages)
  const text = pick(TEXT)
  if (!saved) return nothing(text.openToAnswer)
  const { now, taskId, reply } = input
  if (reply !== 'done' && reply !== 'again') return nothing(text.unknownReply)

  const state = projected(saved, input.inbox, input.widgetChanges)
  const task = state.tasks.find((item) => item.id === taskId)
  if (!task || task.done) return nothing(text.nothingToChange)

  let ask: InboxAsk
  if (reply === 'done') ask = { taskId: task.id, reply }
  else {
    const duration = extendedDuration(task, now)
    if (duration === null) return nothing(text.nothingToChange)
    ask = { taskId: task.id, reply, duration }
  }

  const entry: InboxEntry = { id: newId(), createdAt: now, places: [], tasks: [], ask }
  const next = applyInbox(state, [entry]).state
  const message = reply === 'done' ? text.done(task.title) : text.extended(task.title)
  return { entry, message, plan: nativePlan(next, now), badge: badgeCount(next.tasks, now), widget: widgetSnapshot(next, now) }
}
