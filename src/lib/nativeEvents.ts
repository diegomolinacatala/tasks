/** Lo que llega del lado nativo (Siri, accesos rápidos, avisos, widget) se valida como cualquier dato externo. */

const MAX_TEXT = 500
const MAX_ID = 100

export type NativeAction =
  | { type: 'add'; text: string }
  | { type: 'compose' }
  | { type: 'week' }
  /** Widget: tocarlo fuera de una tarea. */
  | { type: 'today' }
  /** Widget: tocar una tarea. */
  | { type: 'open'; taskId: string }
  /** Siri o un atajo han dejado tareas en la bandeja con la app abierta. */
  | { type: 'inbox' }

/** Tarea marcada o desmarcada en el widget mientras la app no estaba delante. */
export interface WidgetChange {
  taskId: string
  done: boolean
}

export interface NotificationEvent {
  /**
   * `today`: pasar a hoy la tarea del aviso o, desde el resumen diario, todo lo atrasado.
   * `again`: "Todavía no" en el aviso de cierre; la tarea se alarga y vuelve a preguntar.
   */
  action: 'open' | 'done' | 'snooze' | 'today' | 'again'
  /** Vacío en el resumen diario; varias en un aviso de lugar. */
  taskIds: string[]
  placeId: string | null
  /** El aviso preguntaba si la tarea ya estaba hecha. */
  ask?: true
}

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null

const isId = (value: unknown): value is string => typeof value === 'string' && value.length > 0 && value.length <= MAX_ID

export function parseNativeAction(raw: unknown): NativeAction | null {
  if (!isObject(raw)) return null
  if (raw.type === 'compose' || raw.type === 'week' || raw.type === 'today' || raw.type === 'inbox') return { type: raw.type }
  if (raw.type === 'open') return isId(raw.taskId) ? { type: 'open', taskId: raw.taskId } : null
  if (raw.type !== 'add' || typeof raw.text !== 'string') return null
  const text = raw.text.trim().slice(0, MAX_TEXT)
  return text ? { type: 'add', text } : null
}

const ACTIONS: Record<string, NotificationEvent['action']> = {
  tap: 'open',
  done: 'done',
  snooze: 'snooze',
  today: 'today',
  again: 'again',
}

/** `actionId` del plugin de notificaciones ("tap", "dismiss" o el id del botón) y el `extra` del aviso. */
export function parseNotificationEvent(actionId: string, extra: unknown): NotificationEvent | null {
  const action = ACTIONS[actionId]
  if (!action || !isObject(extra)) return null
  const placeId = typeof extra.placeId === 'string' && extra.placeId ? extra.placeId : null
  const ids = placeId ? extra.taskIds : extra.taskId
  const taskIds = typeof ids === 'string' ? ids.split(',').filter(Boolean) : []
  return { action, taskIds, placeId, ...(extra.ask === '1' ? { ask: true as const } : {}) }
}

/** `changes` de `TasksNative.widgetChanges()`: lo que no tenga forma de cambio se descarta. */
export function parseWidgetChanges(raw: unknown): WidgetChange[] {
  if (!Array.isArray(raw)) return []
  return raw.flatMap((item: unknown) =>
    isObject(item) && isId(item.taskId) && typeof item.done === 'boolean' ? [{ taskId: item.taskId, done: item.done }] : [],
  )
}
