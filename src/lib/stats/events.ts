import type { Action } from '../../state/actions'
import type { InboxEntry } from '../inbox'

/**
 * Qué cuenta cada acción del reducer: su tipo y, en lo que crea tareas, rasgos de su forma (¿lleva
 * hora?, ¿un aviso por lugar?). Nunca el contenido: ni títulos, ni nombres, ni horas, ni lugares.
 * `state/replace` no cuenta: es cargar el estado o deshacer un import, no algo que alguien haga.
 */
export function actionEvents(action: Action): string[] {
  if (action.type === 'state/replace') return []
  if (action.type !== 'task/add') return [action.type]
  const traits = [
    action.date !== null ? 'date' : '',
    action.time ? 'time' : '',
    action.duration ? 'duration' : '',
    action.until ? 'until' : '',
    action.sectionId !== null ? 'section' : '',
    action.importance !== undefined ? 'importance' : '',
    ...new Set((action.reminders ?? []).map((reminder) => reminder.kind)),
  ].filter(Boolean)
  return ['task/add', ...traits.map((trait) => `task/add+${trait}`)]
}

/** Lo que llega de fuera de la app (Siri, Atajos, el "¿Has acabado?" de un aviso), por clase. */
export function inboxEvents(entries: readonly InboxEntry[]): string[] {
  return entries.flatMap((entry) => {
    if (entry.move) return ['inbox/move']
    if (entry.ask) return ['inbox/ask']
    return entry.tasks.length || entry.text ? ['inbox/add'] : []
  })
}
