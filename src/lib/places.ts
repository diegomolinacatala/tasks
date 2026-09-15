import type { AppState, IsoDate, Place, PlaceLocation, PlaceTrigger, ReminderDraft, Task } from '../types'
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
const MAX_ADDRESS = 200
const BODY_PREVIEW = 3

const ARTICLE = /^(?:el|la|los|las|mi|mis) /

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null

/** Nombre comparable: sin tildes, mayúsculas, espacios de más ni artículo delante. */
export const placeKey = (name: string) => fold(name).replace(/\s+/g, ' ').trim().replace(ARTICLE, '')

export const cleanPlaceName = (name: string) => name.replace(/\s+/g, ' ').trim().slice(0, MAX_PLACE_NAME)

export function findPlace(places: readonly Place[], name: string): Place | null {
  const key = placeKey(name)
  if (!key) return null
  return places.find((place) => placeKey(place.name) === key) ?? null
}

/** `Al llegar a Mercadona`, `Al salir de Casa`. */
export const placeTriggerLabel = (name: string, on: PlaceTrigger) => (on === 'arrive' ? `Al llegar a ${name}` : `Al salir de ${name}`)

export function placeReminderLabel(reminder: Extract<ReminderDraft, { kind: 'place' }>, places: readonly Place[]): string {
  return placeTriggerLabel(places.find((place) => place.id === reminder.placeId)?.name ?? 'un lugar', reminder.on)
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
  return { id: raw.id, name, location: normalizeLocation(raw.location), radius }
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
        title: on === 'arrive' ? place.name : `Al salir de ${place.name}`,
        body: bodyOf(sorted),
        taskIds: sorted.map((task) => task.id),
        due: hasDayDue(sorted, today),
      },
    ]
  })

  return alerts
    .sort((a, b) => Number(b.due) - Number(a.due) || b.taskIds.length - a.taskIds.length || a.title.localeCompare(b.title))
    .slice(0, MAX_PLACE_ALERTS)
    .map(({ due: _due, ...alert }) => alert)
}
