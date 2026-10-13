import { createContext, useContext } from 'react'

/**
 * Lo que se puede hacer con una fila, por id. Llega por contexto y no cambia entre renders: así las
 * filas memorizadas no se vuelven a pintar cada vez que cambia cualquier otra tarea.
 */
export interface RowActions {
  toggle: (id: string) => void
  remove: (id: string) => void
  open: (id: string) => void
  setImportance: (id: string, importance: number) => void
  toggleRoutine: (id: string, date: string) => void
  removeRoutine: (id: string) => void
  openRoutine: (id: string) => void
}

const noop = () => undefined

export const RowActionsContext = createContext<RowActions>({
  toggle: noop,
  remove: noop,
  open: noop,
  setImportance: noop,
  toggleRoutine: noop,
  removeRoutine: noop,
  openRoutine: noop,
})

export const useRowActions = (): RowActions => useContext(RowActionsContext)

/** Desde fuera de `App` (el panel de un lugar vive por encima): un aviso del DOM que `App` recoge. */
export const OPEN_TASK_EVENT = 'tasks:open-task'

export const requestOpenTask = (id: string): void => {
  window.dispatchEvent(new CustomEvent(OPEN_TASK_EVENT, { detail: id }))
}
