import { del, get, set } from 'idb-keyval'
import type { RoomLink } from '../../types'
import { normalizeRoomLink } from '../baskets'

/**
 * Las credenciales de este dispositivo en tu grupo (la sala personal). Son del dispositivo: no van en el
 * estado ni en las copias, y desvincularlo las borra sin tocar lo guardado.
 */
const LINK_KEY = 'tasks:link'

export async function loadDeviceLink(): Promise<RoomLink | null> {
  return normalizeRoomLink(await get(LINK_KEY).catch(() => null))
}

export const saveDeviceLink = (link: RoomLink): Promise<void> => set(LINK_KEY, link)

export const clearDeviceLink = (): Promise<void> => del(LINK_KEY).catch(() => undefined)
