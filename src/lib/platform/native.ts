import { registerPlugin } from '@capacitor/core'
import type { PluginListenerHandle } from '@capacitor/core'
import type { PlaceNotification } from '../nativeSchedule'

export type PermissionStatus = 'granted' | 'denied' | 'prompt'

export interface FoundPlace {
  name: string
  address: string
  lat: number
  lng: number
}

/** Plugin propio de la app (ios/App/App/TasksNativePlugin.swift). Solo existe en el iPhone. */
interface TasksNativePlugin {
  setBadge(options: { count: number }): Promise<void>
  openSettings(): Promise<void>
  locationStatus(): Promise<{ status: PermissionStatus }>
  requestLocationPermission(): Promise<{ status: PermissionStatus }>
  currentPosition(): Promise<{ lat: number; lng: number; accuracy: number }>
  searchPlaces(options: { query: string; lat?: number; lng?: number }): Promise<{ results: FoundPlace[] }>
  syncPlaceAlerts(options: { alerts: PlaceNotification[] }): Promise<{ scheduled: number; changed: number }>
  /** Siri y accesos rápidos del icono. El contenido llega sin validar: ver `parseNativeAction`. */
  addListener(event: 'action', listener: (action: unknown) => void): Promise<PluginListenerHandle>
}

export const TasksNative = registerPlugin<TasksNativePlugin>('TasksNative')
