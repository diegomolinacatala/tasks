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

/** El horario de un día: soltar ahí entre dos cosas le pone hora a lo que se arrastra. */
export const timelineDropId = (date: string) => `tl:${date}`
export const timelineOfDrop = (id: string) => (id.startsWith('tl:') ? id.slice(3) : null)

/** Un evento del calendario del iPhone, que se coge para llevarlo a otro día o a otra hora. */
export const eventDragId = (key: string) => `event:${key}`
export const eventKeyOf = (id: string) => (id.startsWith('event:') ? id.slice(6) : null)
