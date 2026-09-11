export const ROOT = 'root'

export const columnId = (key: string) => `col:${key}`
export const sectionDragId = (id: string) => `sec:${id}`

export const columnKeyOf = (id: string) => (id.startsWith('col:') ? id.slice(4) : null)
export const sectionIdOf = (id: string) => (id.startsWith('sec:') ? id.slice(4) : null)
