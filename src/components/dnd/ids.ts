/** Claves de las columnas fijas de la pantalla principal. */
export const OVERDUE = 'overdue'
export const ROOT = 'root'
export const BACKLOG = 'backlog'

export const columnId = (key: string) => `col:${key}`
export const sectionDragId = (id: string) => `sec:${id}`

export const columnKeyOf = (id: string) => (id.startsWith('col:') ? id.slice(4) : null)
export const sectionIdOf = (id: string) => (id.startsWith('sec:') ? id.slice(4) : null)

/** Días donde soltar una tarea para llevarla a ese día (la tira de la semana, el muelle de la bandeja). */
export const dayDropId = (date: string) => `day:${date}`
export const dayOfDrop = (id: string) => (id.startsWith('day:') ? id.slice(4) : null)
