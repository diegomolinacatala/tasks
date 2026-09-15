import { createId } from '../lib/id'
import { todayIso } from '../lib/date'
import type { AppState, Task } from '../types'
import { SCHEMA_VERSION, defaultSettings } from './reducer'

/** Primer arranque: tres tareas que enseñan los gestos y se borran solas al usarlas. */
export function seedState(): AppState {
  const date = todayIso()
  const titles = [
    'Desliza a la derecha para completar',
    'Desliza a la izquierda para borrar',
    'Arrastra por el asa de la derecha para mover',
  ]

  const tasks: Task[] = titles.map((title, order) => ({
    id: createId(),
    title,
    done: false,
    date,
    time: null,
    reminders: [],
    sectionId: null,
    order,
    createdAt: Date.now() + order,
    completedAt: null,
  }))

  return { schemaVersion: SCHEMA_VERSION, tasks, sections: [], places: [], collapsed: { overdue: false, backlog: false }, settings: defaultSettings() }
}
