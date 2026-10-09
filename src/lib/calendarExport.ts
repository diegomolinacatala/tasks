import type { Task } from '../types'
import { addDays, isoOfInstant, toInstant } from './date'
import { compareText } from './order'
import { asOf } from './period'

/**
 * Las tareas con hora, como eventos en un calendario del iPhone: el «Tasks» que crea la app o el que se
 * elija (el del trabajo, para que lo vea quien lo comparte). Va en un solo sentido: aquí se calcula la
 * lista entera de lo que tiene que haber y `CalendarExport.swift` crea, cambia o borra lo justo. Tachar,
 * borrar o quitarle la hora a una tarea quita su evento.
 */

export interface ExportItem {
  taskId: string
  title: string
  /** Epoch ms. */
  start: number
  end: number
}

/** Un evento necesita final: lo que no dice cuánto dura ocupa media hora en el calendario. */
export const DEFAULT_EVENT_MINUTES = 30
/** Más que esto sería un error, no una agenda. */
export const MAX_EXPORT = 400
/** Lo atrasado sigue en su sitio un tiempo (es historia); más allá, sale del calendario. */
const KEEP_PAST_DAYS = 60
const MINUTE_MS = 60_000

/** Lo pendiente con día y hora; una tarea con plazo, en el día en que se ve. */
export function exportItems(tasks: readonly Task[], now: number): ExportItem[] {
  const today = isoOfInstant(now)
  const since = addDays(today, -KEEP_PAST_DAYS)
  const items = tasks.flatMap((task): ExportItem[] => {
    if (task.done || !task.time) return []
    const placed = asOf(task, today)
    if (!placed.date || placed.date < since) return []
    const start = toInstant(placed.date, task.time)
    return [{ taskId: task.id, title: task.title, start, end: start + (task.duration ?? DEFAULT_EVENT_MINUTES) * MINUTE_MS }]
  })
  // Si sobraran, se quedan las más recientes y lo que viene.
  return items.sort((a, b) => a.start - b.start || compareText(a.taskId, b.taskId)).slice(-MAX_EXPORT)
}
