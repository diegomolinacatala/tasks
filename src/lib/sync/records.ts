import type { AppState, BlockId, Place, Routine, Section, Settings, SharedBasket, ShoppingItem, ShoppingMemory, Task } from '../../types'
import { MAX_BASKETS, cleanBasketName, normalizeRoomLink } from '../baskets'
import { normalizeSection, normalizeTask } from '../backup'
import { isValidTime } from '../date'
import { isLanguageSetting } from '../i18n'
import { normalizePlace } from '../places'
import { normalizeRoutine } from '../routines'
import { MAX_SHOPPING_ITEMS, MAX_SHOPPING_MEMORY, normalizeItem, normalizeMemory, shoppingKey } from '../shopping'

/**
 * El estado repartido en registros (`docs/sincronizacion.md`): cada tarea, sección, lugar, rutina o cosa de
 * la cesta es un registro con su clave lógica (`t:<id>`…) y sus campos. Lo que viaja se sella campo a campo
 * (`stamp.ts`); aquí solo se pasa del estado a registros y de vuelta.
 */
export type Fields = Readonly<Record<string, unknown>>

/** Un registro que cambia: su valor nuevo, o `null` si se ha borrado. */
export interface SyncChange {
  key: string
  value: Fields | null
}

export const PERSONAL = 'personal'

/** El nombre de una cesta a la que acabas de entrar, hasta que llega el suyo. */
export const PLACEHOLDER_NAME = '…'

/** Los ajustes que viajan; el resto (calendario, dictado, estadísticas, bienvenida) es de cada dispositivo. */
export type SyncedSettings = Pick<Settings, 'theme' | 'language' | 'digest' | 'dayStart'>

export const syncedDefaults = (): SyncedSettings => ({
  theme: 'auto',
  language: 'auto',
  digest: { enabled: false, time: '08:30' },
  dayStart: '00:00',
})

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null

/**
 * Los campos de un objeto sin su id. El estado es inmutable: el mismo objeto da el mismo registro, así que se
 * recuerda y comparar dos estados casi siempre es comparar referencias.
 */
const cache = new WeakMap<object, Fields>()

function fieldsOf(entity: { id: string }): Fields {
  const known = cache.get(entity)
  if (known) return known
  const { id: _id, ...fields } = entity
  cache.set(entity, fields)
  return fields
}

function memoryFields(memory: ShoppingMemory): Fields {
  const known = cache.get(memory)
  if (known) return known
  const fields = { name: memory.name, count: memory.count, at: memory.at }
  cache.set(memory, fields)
  return fields
}

function addShopping(out: Map<string, Fields>, items: readonly ShoppingItem[], history: readonly ShoppingMemory[]) {
  for (const item of items) out.set(`i:${item.id}`, fieldsOf(item))
  for (const memory of history) out.set(`h:${shoppingKey(memory.name)}`, memoryFields(memory))
}

/** Los registros de tu sala personal: todo lo tuyo menos lo que es de este dispositivo. */
export function personalRecords(state: AppState): Map<string, Fields> {
  const out = new Map<string, Fields>()
  for (const task of state.tasks) out.set(`t:${task.id}`, fieldsOf(task))
  for (const section of state.sections) out.set(`s:${section.id}`, fieldsOf(section))
  for (const place of state.places) out.set(`p:${place.id}`, fieldsOf(place))
  for (const routine of state.routines) out.set(`r:${routine.id}`, fieldsOf(routine))
  addShopping(out, state.shopping.items, state.shopping.history)
  out.set('g:shop', { placeId: state.shopping.placeId })
  const { theme, language, digest, dayStart } = state.settings
  out.set('g:settings', { theme, language, digestEnabled: digest.enabled, digestTime: digest.time, dayStart })
  out.set('g:collapsed', { ...state.collapsed })
  for (const basket of state.baskets) {
    out.set(`b:${basket.id}`, { name: basket.name, placeId: basket.placeId, order: basket.order, ...basket.link })
  }
  return out
}

/** Los registros de una cesta compartida: sus cosas, lo comprado otras veces y su nombre. */
export function basketRecords(basket: SharedBasket): Map<string, Fields> {
  const out = new Map<string, Fields>()
  addShopping(out, basket.items, basket.history)
  // El nombre provisional de quien acaba de entrar no se sube: pisaría el de verdad.
  if (basket.name !== PLACEHOLDER_NAME) out.set('g:meta', { name: basket.name })
  return out
}

/** Cambia (o quita, con `value` nulo) el elemento de esa id en una lista; la misma lista si no cambia. */
function upsert<T extends { id: string }>(list: readonly T[], id: string, value: T | null): readonly T[] {
  const index = list.findIndex((item) => item.id === id)
  if (value === null) return index < 0 ? list : list.filter((_, at) => at !== index)
  if (index < 0) return [...list, value]
  return list.map((item, at) => (at === index ? value : item))
}

function upsertMemory(history: readonly ShoppingMemory[], key: string, value: Fields | null): readonly ShoppingMemory[] {
  const index = history.findIndex((memory) => shoppingKey(memory.name) === key)
  const memory = value ? normalizeMemory(value) : null
  if (!memory) return index < 0 ? history : history.filter((_, at) => at !== index)
  return index < 0 ? [...history, memory] : history.map((item, at) => (at === index ? memory : item))
}

const withId = (id: string, value: Fields | null) => (value ? { ...value, id } : null)

interface Lists {
  tasks: readonly Task[]
  sections: readonly Section[]
  places: readonly Place[]
  routines: readonly Routine[]
  items: readonly ShoppingItem[]
  history: readonly ShoppingMemory[]
}

/** Las listas con un registro aplicado. Lo que no se entiende se ignora: viene de otro dispositivo. */
function applyEntity(lists: Lists, kind: string, id: string, value: Fields | null): Lists {
  switch (kind) {
    case 't':
      // La sección se conserva aunque aún no haya llegado: llega en el mismo lote o en el siguiente.
      return { ...lists, tasks: upsert(lists.tasks, id, value ? keepSection(normalizeTask(withId(id, value)), value) : null) }
    case 's':
      return { ...lists, sections: upsert(lists.sections, id, value ? normalizeSection(withId(id, value)) : null) }
    case 'p':
      return { ...lists, places: upsert(lists.places, id, value ? normalizePlace(withId(id, value)) : null) }
    case 'r':
      return { ...lists, routines: upsert(lists.routines, id, value ? normalizeRoutine(withId(id, value)) : null) }
    case 'i':
      return { ...lists, items: upsert(lists.items, id, value ? normalizeItem(withId(id, value)) : null) }
    case 'h':
      return { ...lists, history: upsertMemory(lists.history, id, value) }
    default:
      return lists
  }
}

/**
 * Una cesta compartida la llena cualquiera de sus miembros: lo que llega no pasa de lo que cabe en una cesta
 * (lo pendiente y otro tanto comprado), y lo que ya había se queda antes que lo nuevo.
 */
const MAX_RECEIVED_ITEMS = MAX_SHOPPING_ITEMS * 2

const capItems = (items: readonly ShoppingItem[]): ShoppingItem[] => items.slice(0, MAX_RECEIVED_ITEMS)
const capHistory = (history: readonly ShoppingMemory[]): ShoppingMemory[] => history.slice(0, MAX_SHOPPING_MEMORY)

function keepSection(task: Task | null, value: Fields): Task | null {
  if (!task || !task.date || typeof value.sectionId !== 'string') return task
  return { ...task, sectionId: value.sectionId }
}

function splitKey(key: string): [string, string] {
  const at = key.indexOf(':')
  return at < 0 ? ['', key] : [key.slice(0, at), key.slice(at + 1)]
}

function applySettings(settings: Settings, value: Fields | null): Settings {
  if (!value) return settings
  const theme = value.theme === 'light' || value.theme === 'dark' || value.theme === 'auto' ? value.theme : settings.theme
  const language = isLanguageSetting(value.language) ? value.language : settings.language
  const digest = {
    enabled: typeof value.digestEnabled === 'boolean' ? value.digestEnabled : settings.digest.enabled,
    time: isValidTime(value.digestTime) ? value.digestTime : settings.digest.time,
  }
  const dayStart = isValidTime(value.dayStart) ? value.dayStart : settings.dayStart
  return { ...settings, theme, language, digest, dayStart }
}

function applyCollapsed(collapsed: AppState['collapsed'], value: Fields | null): AppState['collapsed'] {
  if (!value) return collapsed
  const read = (block: BlockId) => (typeof value[block] === 'boolean' ? (value[block] as boolean) : collapsed[block])
  return { overdue: read('overdue'), backlog: read('backlog'), routines: read('routines') }
}

/** Una cesta compartida que llega de otro de tus dispositivos: sus credenciales, tu tienda y su orden. */
function applyBasketLink(baskets: readonly SharedBasket[], id: string, value: Fields | null): readonly SharedBasket[] {
  const current = baskets.find((basket) => basket.id === id) ?? null
  if (!value) return upsert(baskets, id, null)
  if (!current && baskets.length >= MAX_BASKETS) return baskets
  const link = normalizeRoomLink(value)
  if (!link || link.room !== id) return baskets
  const placeId = typeof value.placeId === 'string' ? value.placeId : null
  const order = typeof value.order === 'number' && Number.isFinite(value.order) ? value.order : 0
  const name = cleanBasketName(value.name) || current?.name || '…'
  const next: SharedBasket = current
    ? { ...current, name, placeId, order, link }
    : { id, name, items: [], history: [], placeId, order, link }
  return upsert(baskets, id, next)
}

function applyPersonal(state: AppState, changes: readonly SyncChange[]): AppState {
  let lists: Lists = { ...state, items: state.shopping.items, history: state.shopping.history }
  let { settings, collapsed, baskets } = state
  let placeId = state.shopping.placeId
  for (const { key, value } of changes) {
    const [kind, id] = splitKey(key)
    if (key === 'g:settings') settings = applySettings(settings, value)
    else if (key === 'g:collapsed') collapsed = applyCollapsed(collapsed, value)
    else if (key === 'g:shop') placeId = value && typeof value.placeId === 'string' ? value.placeId : null
    else if (kind === 'b') baskets = applyBasketLink(baskets, id, value) as SharedBasket[]
    else lists = applyEntity(lists, kind, id, value)
  }
  return {
    ...state,
    tasks: lists.tasks as Task[],
    sections: lists.sections as Section[],
    places: lists.places as Place[],
    routines: lists.routines as Routine[],
    shopping: { items: capItems(lists.items), history: capHistory(lists.history), placeId },
    settings,
    collapsed,
    baskets,
  }
}

function applyBasket(state: AppState, id: string, changes: readonly SyncChange[]): AppState {
  const basket = state.baskets.find((item) => item.id === id)
  if (!basket) return state
  let lists: Lists = { tasks: [], sections: [], places: [], routines: [], items: basket.items, history: basket.history }
  let name = basket.name
  for (const { key, value } of changes) {
    if (key === 'g:meta') {
      name = (value && isObject(value) && cleanBasketName(value.name)) || name
      continue
    }
    const [kind, entity] = splitKey(key)
    if (kind === 'i' || kind === 'h') lists = applyEntity(lists, kind, entity, value)
  }
  const next = { ...basket, name, items: capItems(lists.items), history: capHistory(lists.history) }
  return { ...state, baskets: state.baskets.map((item) => (item === basket ? next : item)) }
}

/** Aplica lo que llega de una sala: `scope` es `personal` o el id de una cesta compartida. */
export function applySync(state: AppState, scope: string, changes: readonly SyncChange[]): AppState {
  if (!changes.length) return state
  return scope === PERSONAL ? applyPersonal(state, changes) : applyBasket(state, scope, changes)
}
