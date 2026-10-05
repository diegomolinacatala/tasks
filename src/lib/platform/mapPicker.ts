import type { PlaceLocation } from '../../types'
import { isNative } from './index'

export interface MapPickRequest {
  /** Encima del mapa: el nombre del lugar o "Nuevo lugar". */
  title: string
  /** El botón de abajo. */
  confirm: string
  /** Etiquetas de los botones que solo llevan icono. */
  cancel: string
  locate: string
  /** Dónde se abre; sin él, donde estás (o entre tus lugares). */
  center?: { lat: number; lng: number }
  /** Metros del círculo del aviso. */
  radius: number
  /** Los demás lugares, para orientarse. */
  places: { name: string; lat: number; lng: number; radius: number }[]
}

export interface MapPick {
  location: PlaceLocation
  /** El comercio del mapa que se tocó ("Mercadona"), si se tocó uno. */
  name: string | null
}

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null
const isCoordinate = (value: unknown, limit: number): value is number =>
  typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= limit

/**
 * Abre el mapa de Apple a pantalla completa para atinar dónde está un lugar (solo en el iPhone:
 * `MapPicker.swift`). `null` si se cierra sin elegir o si no hay mapa (la web).
 */
export async function pickOnMap(request: MapPickRequest): Promise<MapPick | null> {
  if (!isNative) return null
  const { TasksNative } = await import('./native')
  const result: unknown = await TasksNative.pickLocation(request)
  if (!isObject(result) || result.cancelled === true || !isCoordinate(result.lat, 90) || !isCoordinate(result.lng, 180)) return null
  const address = typeof result.address === 'string' ? result.address.trim().slice(0, 200) : ''
  const name = typeof result.name === 'string' && result.name.trim() ? result.name.trim() : null
  return { location: { lat: result.lat, lng: result.lng, address }, name }
}
