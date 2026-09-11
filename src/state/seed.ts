import { createId } from '../lib/id'
import { todayIso } from '../lib/date'
import type { AppState, Task } from '../types'
import { SCHEMA_VERSION } from './reducer'

/** Primer arranque: tres tareas que enseñan los gestos y se borran solas al usarlas. */
export function seedState(): AppState {
  const date = todayIso()
  const titles = [
    'Desliza a la derecha para completar',
    'Desliza a la izquierda para borrar',
    'Mantén pulsado y arrastra para reordenar',
  ]

  const tasks: Task[] = titles.map((title, order) => ({
    id: createId(),
    title,
    done: false,
    date,
    sectionId: null,
    order,
    createdAt: Date.now() + order,
    completedAt: null,
  }))

  return { schemaVersion: SCHEMA_VERSION, tasks, sections: [] }
}
