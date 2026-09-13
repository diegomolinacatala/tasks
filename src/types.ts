/** Fecha local en formato YYYY-MM-DD. `null` = sin fecha. */
export type IsoDate = string

/** Hora local en formato HH:MM. */
export type IsoTime = string

/**
 * `at`: instante absoluto (epoch ms).
 * `before`: minutos antes de la fecha y hora de la tarea; sigue a la tarea si cambia de día.
 */
export type ReminderDraft = { kind: 'at'; at: number } | { kind: 'before'; minutes: number }

export type Reminder = ReminderDraft & { id: string }

export interface Task {
  id: string
  title: string
  done: boolean
  date: IsoDate | null
  /** Solo tiene efecto si hay fecha. */
  time: IsoTime | null
  reminders: Reminder[]
  /** Sección a la que pertenece dentro del día. `null` = raíz. */
  sectionId: string | null
  /** Posición dentro de su scope (ver lib/order.ts). */
  order: number
  createdAt: number
  completedAt: number | null
}

export interface Section {
  id: string
  name: string
  order: number
  collapsed: boolean
}

/** Bloques fijos de la pantalla principal que se pueden plegar. */
export type BlockId = 'overdue' | 'backlog'

export interface AppState {
  schemaVersion: number
  tasks: Task[]
  sections: Section[]
  collapsed: Record<BlockId, boolean>
}

export type ViewId = 'home' | 'week'
