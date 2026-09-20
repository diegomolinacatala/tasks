/** Fecha local en formato YYYY-MM-DD. `null` = sin fecha. */
export type IsoDate = string

/** Hora local en formato HH:MM. */
export type IsoTime = string

/** Cuándo suena un aviso de lugar: al entrar en su radio o al salir de él. */
export type PlaceTrigger = 'arrive' | 'leave'

/**
 * `at`: instante absoluto (epoch ms).
 * `before`: minutos antes de la fecha y hora de la tarea; sigue a la tarea si cambia de día.
 * `place`: al llegar a un lugar guardado o salir de él (solo en la app de iPhone). Suena cada
 *   vez mientras la tarea siga pendiente y su día haya llegado.
 */
export type ReminderDraft =
  | { kind: 'at'; at: number }
  | { kind: 'before'; minutes: number }
  | { kind: 'place'; placeId: string; on: PlaceTrigger }

export type Reminder = ReminderDraft & { id: string }

export interface Task {
  id: string
  title: string
  done: boolean
  date: IsoDate | null
  /** Solo tiene efecto si hay fecha. */
  time: IsoTime | null
  /**
   * Cuánto dura, en minutos (`lib/duration.ts`). Solo tiene efecto con fecha y hora: al acabar
   * llega el aviso que pregunta si ya está hecha. `null` = sin duración, sin pregunta.
   */
  duration: number | null
  reminders: Reminder[]
  /** Sección a la que pertenece dentro del día. `null` = raíz. */
  sectionId: string | null
  /** Posición dentro de su scope (ver lib/order.ts). */
  order: number
  /**
   * Importancia del 1 al 10 (`lib/importance.ts`): se ve como el tamaño del título. 1 = normal.
   * No reordena nada: el orden lo sigue decidiendo el usuario.
   */
  importance: number
  createdAt: number
  completedAt: number | null
}

/** Tarea por crear: lo que sale del compositor, del dictado o de Siri. */
export interface TaskDraft {
  title: string
  date: IsoDate | null
  time: IsoTime | null
  /** Minutos que dura, si se dijo ("durante una hora", "de 5 a 7"). */
  duration: number | null
  reminders: ReminderDraft[]
  /** Lugar dicho que aún no está guardado ("al pasar por Mercadona"): se crea al añadir la tarea. */
  newPlace?: { name: string; on: PlaceTrigger }
}

export interface Section {
  id: string
  name: string
  order: number
  collapsed: boolean
}

export interface PlaceLocation {
  lat: number
  lng: number
  /** Dirección legible de Apple Maps; vacía si se guardó con la ubicación actual. */
  address: string
}

/** Sitio con nombre ("Mercadona", "Universidad") al que se atan avisos. Global, como las secciones. */
export interface Place {
  id: string
  name: string
  /** `null` mientras no se ha elegido dónde está: sus avisos quedan inactivos. */
  location: PlaceLocation | null
  /** Metros. */
  radius: number
}

/** Bloques fijos de la pantalla principal que se pueden plegar. */
export type BlockId = 'overdue' | 'backlog'

/** Aviso diario con lo que hay para ese día. */
export interface DigestSettings {
  enabled: boolean
  time: IsoTime
}

export interface Settings {
  digest: DigestSettings
}

export interface AppState {
  schemaVersion: number
  tasks: Task[]
  sections: Section[]
  places: Place[]
  collapsed: Record<BlockId, boolean>
  settings: Settings
}

export type ViewId = 'home' | 'week'
