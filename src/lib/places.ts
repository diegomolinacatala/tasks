import type { AppState, IsoDate, Place, PlaceLocation, PlaceTrigger, ReminderDraft, Task } from '../types'
import { language } from './i18n'
import { compareNames } from './order'
import { fold } from './normalize'

export const DEFAULT_RADIUS = 150
/** Por debajo de 100 m iOS no detecta la entrada con fiabilidad. */
export const MIN_RADIUS = 100
export const MAX_RADIUS = 1000
export const RADIUS_OPTIONS = [100, 150, 300, 500] as const
export const MAX_PLACES = 50
/** iOS vigila como mucho 20 regiones por app. */
export const MAX_PLACE_ALERTS = 20
export const MAX_PLACE_NAME = 60
/** Otros nombres por lugar: los que de verdad se usan para un sitio son pocos. */
export const MAX_ALIASES = 8
const MAX_ADDRESS = 200
/** Por debajo, un nombre se parece a demasiados ("casa", "caja"): solo vale tal cual. */
const FUZZY_MIN = 5
/** Desde aquí se toleran dos letras cambiadas en lugar de una. */
const FUZZY_LONG = 9
const BODY_PREVIEW = 3

const ARTICLE = /^(?:el|la|los|las|mi|mis|the|my) /

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null

/** Nombre comparable: sin tildes, mayúsculas, espacios de más ni artículo delante. */
export const placeKey = (name: string) => fold(name).replace(/\s+/g, ' ').trim().replace(ARTICLE, '')

export const cleanPlaceName = (name: string) => name.replace(/\s+/g, ' ').trim().slice(0, MAX_PLACE_NAME)

/** El nombre y los otros nombres de un lugar. */
export const placeNames = (place: Pick<Place, 'name' | 'aliases'>): string[] => [place.name, ...place.aliases]

const keysOf = (place: Pick<Place, 'name' | 'aliases'>): string[] => placeNames(place).map(placeKey).filter(Boolean)

/** Todas las formas de nombrar los lugares guardados, comparables y de la más larga a la más corta. */
export const placeKeys = (places: readonly Place[]): string[] =>
  [...new Set(places.flatMap(keysOf))].sort((a, b) => b.length - a.length)

/** El lugar que se llama así, por su nombre o por uno de sus otros nombres. */
export function findPlace(places: readonly Place[], name: string): Place | null {
  const key = placeKey(name)
  if (!key) return null
  return places.find((place) => keysOf(place).includes(key)) ?? null
}

/** Otro lugar (que no sea `except`) ya se llama así, de nombre o de otro nombre. */
export function nameTaken(places: readonly Place[], name: string, except?: string): boolean {
  const key = placeKey(name)
  return Boolean(key) && places.some((place) => place.id !== except && keysOf(place).includes(key))
}

/**
 * Otros nombres saneados: sin vacíos, sin repetir, sin el propio nombre y sin los de `others` (dos
 * lugares que se llamen igual harían ambiguo "al llegar a casa").
 */
export function cleanAliases(aliases: readonly unknown[], name: string, others: readonly Place[]): string[] {
  const seen = new Set([placeKey(name)])
  return aliases
    .flatMap((raw) => {
      if (typeof raw !== 'string') return []
      const alias = cleanPlaceName(raw)
      const key = placeKey(alias)
      if (!key || seen.has(key) || nameTaken(others, alias)) return []
      seen.add(key)
      return [alias]
    })
    .slice(0, MAX_ALIASES)
}

/** Letras que hay que cambiar, quitar o poner para pasar de uno a otro (dos vecinas cambiadas cuentan una). */
function editDistance(a: string, b: string): number {
  let previous: number[] = []
  let current = Array.from({ length: b.length + 1 }, (_, j) => j)
  for (let i = 1; i <= a.length; i++) {
    const next = [i]
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      let value = Math.min((current[j] ?? 0) + 1, (next[j - 1] ?? 0) + 1, (current[j - 1] ?? 0) + cost)
      const swapped = i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]
      if (swapped) value = Math.min(value, (previous[j - 2] ?? 0) + 1)
      next.push(value)
    }
    previous = current
    current = next
  }
  return current[b.length] ?? 0
}

/**
 * El lugar al que se refiere algo escrito o dictado: el que se llama así y, si no hay ninguno, el que se
 * le parece mucho (una letra cambiada; dos en los nombres largos). Lo dictado llega a veces con otra
 * grafía ("Carrefur", "Mercadonna"). Si dos se parecen igual, ninguno: mejor un lugar nuevo que el que no es.
 */
export function matchPlace(places: readonly Place[], name: string): Place | null {
  const exact = findPlace(places, name)
  if (exact) return exact
  const key = placeKey(name)
  if (key.length < FUZZY_MIN) return null
  const allowed = key.length >= FUZZY_LONG ? 2 : 1
  // Los números no se parecen: "Parking 1" no es "Parking 2".
  const digits = key.replace(/\D/g, '')
  const close = places.flatMap((place) => {
    const distances = keysOf(place)
      .filter((other) => other.length >= FUZZY_MIN && Math.abs(other.length - key.length) <= allowed)
      .filter((other) => other.replace(/\D/g, '') === digits)
      .map((other) => editDistance(key, other))
    const nearest = Math.min(...distances)
    return nearest <= allowed ? [{ place, distance: nearest }] : []
  })
  const best = Math.min(...close.map((item) => item.distance))
  const winners = close.filter((item) => item.distance === best)
  return winners.length === 1 ? (winners[0]?.place ?? null) : null
}

/** `Al llegar a Mercadona`, `Al salir de Casa` · `Arriving at Walmart`, `Leaving Home`. */
export function placeTriggerLabel(name: string, on: PlaceTrigger): string {
  if (language() === 'en') return on === 'arrive' ? `Arriving at ${name}` : `Leaving ${name}`
  return on === 'arrive' ? `Al llegar a ${name}` : `Al salir de ${name}`
}

export function placeReminderLabel(reminder: Extract<ReminderDraft, { kind: 'place' }>, places: readonly Place[]): string {
  const fallback = language() === 'en' ? 'a place' : 'un lugar'
  return placeTriggerLabel(places.find((place) => place.id === reminder.placeId)?.name ?? fallback, reminder.on)
}

const EARTH_RADIUS_M = 6_371_000
const toRadians = (degrees: number) => (degrees * Math.PI) / 180

/** Distancia en línea recta (haversine). Basta para ordenar resultados de búsqueda. */
export function distanceMeters(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const dLat = toRadians(b.lat - a.lat)
  const dLng = toRadians(b.lng - a.lng)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRadians(a.lat)) * Math.cos(toRadians(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h))
}

/** `40 m`, `950 m`, `1 km`, `1,2 km` (`1.2 km` en inglés), `25 km`. */
export function formatDistance(meters: number): string {
  if (meters < 1000) return `${Math.round(meters / 10) * 10} m`
  const km = meters / 1000
  const decimal = language() === 'en' ? '.' : ','
  return km < 10 ? `${km.toFixed(1).replace(/\.0$/, '').replace('.', decimal)} km` : `${Math.round(km)} km`
}

export const clampRadius = (radius: number) => Math.min(MAX_RADIUS, Math.max(MIN_RADIUS, Math.round(radius)))

function normalizeLocation(raw: unknown): PlaceLocation | null {
  if (!isObject(raw)) return null
  const { lat, lng, address } = raw
  if (typeof lat !== 'number' || typeof lng !== 'number' || !Number.isFinite(lat) || !Number.isFinite(lng)) return null
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null
  return { lat, lng, address: typeof address === 'string' ? address.trim().slice(0, MAX_ADDRESS) : '' }
}

/** Lugar saneado desde datos externos (backup, almacenamiento). */
export function normalizePlace(raw: unknown): Place | null {
  if (!isObject(raw) || typeof raw.id !== 'string' || !raw.id || typeof raw.name !== 'string') return null
  const name = cleanPlaceName(raw.name)
  if (!name) return null
  const radius = typeof raw.radius === 'number' && Number.isFinite(raw.radius) ? clampRadius(raw.radius) : DEFAULT_RADIUS
  // Los de antes de los otros nombres no los traen. Que no choquen con otros lugares lo mira quien los junta.
  const aliases = cleanAliases(Array.isArray(raw.aliases) ? raw.aliases : [], name, [])
  return { id: raw.id, name, aliases, location: normalizeLocation(raw.location), radius }
}

export interface PlaceAlert {
  /** `<lugar>:<arrive|leave>`: estable entre sincronizaciones. */
  key: string
  placeId: string
  on: PlaceTrigger
  lat: number
  lng: number
  radius: number
  title: string
  body: string
  taskIds: string[]
}

/** Un aviso de lugar cuenta si la tarea sigue pendiente y su día ya ha llegado (o no tiene). */
const isArmed = (task: Task, today: IsoDate) => !task.done && (task.date === null || task.date <= today)

const hasDayDue = (tasks: readonly Task[], today: IsoDate) => tasks.some((task) => task.date !== null && task.date <= today)

function bodyOf(tasks: readonly Task[]): string {
  const titles = tasks.map((task) => task.title)
  const rest = titles.length - BODY_PREVIEW
  return [...titles.slice(0, BODY_PREVIEW), rest > 0 ? `+${rest}` : ''].filter(Boolean).join(' · ')
}

/**
 * Qué regiones debe vigilar el iPhone: una por lugar y sentido, con todas sus tareas en el
 * cuerpo. Si hay más que el máximo de iOS, gana lo que es para hoy o está atrasado y después
 * los lugares con más tareas.
 */
export function placeAlerts(state: Pick<AppState, 'tasks' | 'places'>, today: IsoDate): PlaceAlert[] {
  const located = new Map(state.places.flatMap((place) => (place.location ? [[place.id, place] as const] : [])))

  const groups = state.tasks
    .filter((task) => isArmed(task, today))
    .flatMap((task) =>
      [...new Set(task.reminders.flatMap((reminder) => (reminder.kind === 'place' && located.has(reminder.placeId) ? [`${reminder.placeId}:${reminder.on}`] : [])))].map(
        (key) => ({ key, task }),
      ),
    )
    .reduce((acc, { key, task }) => acc.set(key, [...(acc.get(key) ?? []), task]), new Map<string, Task[]>())

  const alerts = [...groups].flatMap(([key, tasks]): (PlaceAlert & { due: boolean })[] => {
    const [placeId = '', on] = key.split(':')
    const place = located.get(placeId)
    if (!place?.location || (on !== 'arrive' && on !== 'leave')) return []
    const sorted = [...tasks].sort((a, b) => a.createdAt - b.createdAt || a.order - b.order)
    return [
      {
        key,
        placeId,
        on,
        lat: place.location.lat,
        lng: place.location.lng,
        radius: place.radius,
        title: on === 'arrive' ? place.name : placeTriggerLabel(place.name, 'leave'),
        body: bodyOf(sorted),
        taskIds: sorted.map((task) => task.id),
        due: hasDayDue(sorted, today),
      },
    ]
  })

  return alerts
    .sort((a, b) => Number(b.due) - Number(a.due) || b.taskIds.length - a.taskIds.length || compareNames(a.title, b.title))
    .slice(0, MAX_PLACE_ALERTS)
    .map(({ due: _due, ...alert }) => alert)
}
