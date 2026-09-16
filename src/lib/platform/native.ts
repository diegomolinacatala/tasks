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
  /** Foto de las tareas para el widget (`widgetSnapshot`), ya en JSON. */
  syncWidget(options: { json: string }): Promise<void>
  /**
   * Lo marcado desde el widget desde la última lectura; se vacía al leerlo. `changes` llega sin
   * validar (`parseWidgetChanges`). `reschedule`: el widget quitó avisos y hay que reprogramarlos.
   */
  widgetChanges(): Promise<{ changes: unknown; reschedule: boolean }>
  /** Siri, accesos rápidos del icono y enlaces del widget. Llega sin validar: ver `parseNativeAction`. */
  addListener(event: 'action', listener: (action: unknown) => void): Promise<PluginListenerHandle>
}

export const TasksNative = registerPlugin<TasksNativePlugin>('TasksNative')
