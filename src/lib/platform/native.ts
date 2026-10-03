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

export interface MapSnapshotRequest {
  /** Puntos que tiene que enseñar; sin `center`, el mapa los encuadra todos. */
  points: { lat: number; lng: number }[]
  center?: { lat: number; lng: number }
  /** Metros de norte a sur con `center`. */
  span?: number
  /** Puntos de pantalla (CSS px). */
  width: number
  height: number
  dark: boolean
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
  /** Tareas apuntadas con Siri o Atajos sin abrir la app. Llega sin validar: ver `parseInbox`. */
  inbox(): Promise<{ entries: unknown }>
  /** Borra de la bandeja lo que ya está en el fichero de estado. */
  ackInbox(options: { ids: string[] }): Promise<void>
  /** Apariencia de la ventana: `auto` sigue a iOS; `light` y `dark` la fijan (selectores, teclado, menús). */
  setAppearance(options: { style: 'light' | 'dark' | 'auto' }): Promise<void>
  /**
   * Foto de Apple Maps (estilo apagado, sin comercios) centrada en `center` con `span` metros de alto,
   * o encuadrando `points`. Devuelve la imagen y dónde cae cada punto, de 0 a 1.
   */
  mapSnapshot(options: MapSnapshotRequest): Promise<{ image: string; points: { x: number; y: number }[] }>
  /** Foto de lo que enseña la app ahora mismo (el WebView), en JPEG `data:`. Para las sugerencias. */
  screenshot(): Promise<{ image: string }>
  /** Siri, accesos rápidos del icono y enlaces del widget. Llega sin validar: ver `parseNativeAction`. */
  addListener(event: 'action', listener: (action: unknown) => void): Promise<PluginListenerHandle>
}

export const TasksNative = registerPlugin<TasksNativePlugin>('TasksNative')
