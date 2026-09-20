import { createId } from '../lib/id'
import { todayIso } from '../lib/date'
import { DEFAULT_IMPORTANCE } from '../lib/importance'
import type { AppState, Task } from '../types'
import { SCHEMA_VERSION, defaultSettings } from './reducer'

/**
 * Primer arranque: tareas que enseñan los gestos y se borran solas al usarlas. La última ya viene
 * grande: enseña la importancia con su propio tamaño.
 */
export function seedState(): AppState {
  const date = todayIso()
  const seeds = [
    { title: 'Desliza a la derecha para completar', importance: DEFAULT_IMPORTANCE },
    { title: 'Desliza a la izquierda para borrar', importance: DEFAULT_IMPORTANCE },
    { title: 'Arrastra por el asa de la derecha para mover', importance: DEFAULT_IMPORTANCE },
    { title: 'Toca Aa arriba y arrastra el número para agrandar lo importante', importance: 5 },
  ]

  const tasks: Task[] = seeds.map(({ title, importance }, order) => ({
    id: createId(),
    title,
    done: false,
    date,
    time: null,
    duration: null,
    reminders: [],
    sectionId: null,
    order,
    importance,
    createdAt: Date.now() + order,
    completedAt: null,
  }))

  return { schemaVersion: SCHEMA_VERSION, tasks, sections: [], places: [], collapsed: { overdue: false, backlog: false }, settings: defaultSettings() }
}
