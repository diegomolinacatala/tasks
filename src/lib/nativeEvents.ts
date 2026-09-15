/** Lo que llega del lado nativo (Siri, accesos rápidos, avisos) se valida como cualquier dato externo. */

const MAX_TEXT = 500

export type NativeAction = { type: 'add'; text: string } | { type: 'compose' } | { type: 'week' }

export interface NotificationEvent {
  action: 'open' | 'done' | 'snooze'
  /** Vacío en el resumen diario; varias en un aviso de lugar. */
  taskIds: string[]
  placeId: string | null
}

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null

export function parseNativeAction(raw: unknown): NativeAction | null {
  if (!isObject(raw)) return null
  if (raw.type === 'compose' || raw.type === 'week') return { type: raw.type }
  if (raw.type !== 'add' || typeof raw.text !== 'string') return null
  const text = raw.text.trim().slice(0, MAX_TEXT)
  return text ? { type: 'add', text } : null
}

const ACTIONS: Record<string, NotificationEvent['action']> = { tap: 'open', done: 'done', snooze: 'snooze' }

/** `actionId` del plugin de notificaciones ("tap", "dismiss" o el id del botón) y el `extra` del aviso. */
export function parseNotificationEvent(actionId: string, extra: unknown): NotificationEvent | null {
  const action = ACTIONS[actionId]
  if (!action || !isObject(extra)) return null
  const placeId = typeof extra.placeId === 'string' && extra.placeId ? extra.placeId : null
  const ids = placeId ? extra.taskIds : extra.taskId
  const taskIds = typeof ids === 'string' ? ids.split(',').filter(Boolean) : []
  return { action, taskIds, placeId }
}
