import type { PlaceLocation } from '../../types'
import { isNative } from './index'

export interface MapPickRequest {
  /** Encima del mapa: el nombre del lugar o "Nuevo lugar" (al explorar, "Lugares"). */
  title: string
  /** El botón de abajo al elegir un punto. */
  confirm: string
  /** Etiquetas de los botones que solo llevan icono. */
  cancel: string
  locate: string
  /** Dónde se abre; sin él, donde estás (o entre tus lugares). */
  center?: { lat: number; lng: number }
  /** Metros del círculo del aviso. */
  radius: number
  /** Los demás lugares, para orientarse (con su id, para poder abrirlos al explorar). */
  places: { id?: string; name: string; lat: number; lng: number; radius: number }[]
  /** Explorar: el mapa se abre sin chincheta, con tus lugares; "Añadir un lugar" la pone. */
  browse?: boolean
  /** Al explorar: el título mientras se añade, el botón que añade y el que abre el lugar tocado. */
  addTitle?: string
  add?: string
  open?: string
}

export interface MapPick {
  location: PlaceLocation
  /** El comercio del mapa que se tocó ("Mercadona"), si se tocó uno. */
  name: string | null
}

/** Lo que vuelve de explorar el mapa: un punto para un lugar nuevo o el lugar que se quiere abrir. */
export type MapBrowse = { kind: 'pick'; pick: MapPick } | { kind: 'open'; placeId: string }

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null
const isCoordinate = (value: unknown, limit: number): value is number =>
  typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= limit

/** Valida lo que devuelve `TasksNative.pickLocation`. */
export function parseMapResult(result: unknown): MapBrowse | null {
  if (!isObject(result) || result.cancelled === true) return null
  if (typeof result.open === 'string' && result.open) return { kind: 'open', placeId: result.open }
  if (!isCoordinate(result.lat, 90) || !isCoordinate(result.lng, 180)) return null
  const address = typeof result.address === 'string' ? result.address.trim().slice(0, 200) : ''
  const name = typeof result.name === 'string' && result.name.trim() ? result.name.trim() : null
  return { kind: 'pick', pick: { location: { lat: result.lat, lng: result.lng, address }, name } }
}

/**
 * Abre el mapa de Apple a pantalla completa para atinar dónde está un lugar (solo en el iPhone:
 * `MapPicker.swift`). `null` si se cierra sin elegir o si no hay mapa (la web).
 */
export async function pickOnMap(request: MapPickRequest): Promise<MapPick | null> {
  if (!isNative) return null
  const { TasksNative } = await import('./native')
  const result = parseMapResult(await TasksNative.pickLocation({ ...request, browse: false }))
  return result?.kind === 'pick' ? result.pick : null
}

/**
 * El mapa de la pestaña Lugares, entero: tus lugares con sus radios para moverse por ellos, tocar uno
 * para abrirlo o añadir otro con una chincheta. `null` si se cierra sin más o si no hay mapa (la web).
 */
export async function browseMap(request: MapPickRequest): Promise<MapBrowse | null> {
  if (!isNative) return null
  const { TasksNative } = await import('./native')
  return parseMapResult(await TasksNative.pickLocation({ ...request, browse: true }))
}
