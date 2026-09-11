/** Fecha local en formato YYYY-MM-DD. `null` = sin fecha (backlog). */
export type IsoDate = string

export interface Task {
  id: string
  title: string
  done: boolean
  date: IsoDate | null
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

export interface AppState {
  schemaVersion: number
  tasks: Task[]
  sections: Section[]
}

export type ViewId = 'today' | 'week' | 'backlog'
