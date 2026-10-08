import type { CalendarEvent, CalendarInfo, CalendarStatus } from '../calendar'
import { isNative } from './index'

/**
 * Hay calendario en el iPhone (EventKit, `CalendarBridge.swift`). En `npm run dev` y en las capturas,
 * uno de muestra (`calendarDemo.ts`) para poder verlo y probarlo sin iPhone. En la PWA publicada, no.
 */
export const showsCalendar = isNative || import.meta.env.DEV || import.meta.env.MODE === 'shots'

export interface CalendarSource {
  status(): Promise<CalendarStatus>
  /** Pide el permiso (la primera vez sale el aviso de iOS; después, devuelve lo que haya). */
  request(): Promise<CalendarStatus>
  calendars(): Promise<CalendarInfo[]>
  /** Eventos entre dos instantes (epoch ms), sin los calendarios ocultos. */
  events(from: number, to: number, hidden: readonly string[]): Promise<CalendarEvent[]>
  /** La ficha del evento de Calendario de iOS, encima de la app. */
  open(event: CalendarEvent): Promise<void>
  /** Avisa cuando algo cambia en el calendario. Devuelve cómo dejar de escuchar. */
  onChange(listener: () => void): () => void
}

let source: Promise<CalendarSource | null> | null = null

/** El calendario de esta plataforma; `null` si no hay (la PWA publicada). */
export function calendarSource(): Promise<CalendarSource | null> {
  // Lo del iPhone va en su propio trozo: la PWA no lo necesita nunca.
  source ??= isNative
    ? import('./calendarNative').then((module) => module.nativeSource)
    : import.meta.env.DEV || import.meta.env.MODE === 'shots'
      ? import('./calendarDemo').then((module) => module.demoCalendar)
      : Promise.resolve(null)
  return source
}
