/** Lo que muestra la notificación. Viaja cifrado; ver `crypto.ts`. */
export interface NotificationContent {
  /** `null` = aviso general (resumen diario): abre la app sin tarea concreta. */
  taskId: string | null
  title: string
  body: string
  /** Número para el icono de la app, o `null` para no tocarlo. */
  badge: number | null
  /** Hora prevista del aviso (epoch ms), para que el sistema muestre esa y no la de llegada. */
  at?: number
  /** Hay algo atrasado que se puede pasar a hoy desde el aviso (ver `ScheduleEntry.overdue`). */
  overdue?: boolean
  /** Aviso de cierre: pregunta si la tarea ya está hecha (ver `ScheduleEntry.ask`). */
  ask?: boolean
}

const MAX_TITLE = 120
const MAX_BODY = 160

export const FALLBACK_CONTENT: NotificationContent = { taskId: null, title: 'Recordatorio', body: '', badge: null }

const clip = (text: string, max: number) => (text.length > max ? `${text.slice(0, max - 1)}…` : text)

/** Recorta para no pasarse del tamaño que admite el servidor. */
export function contentOf(input: NotificationContent): NotificationContent {
  return { ...input, title: clip(input.title, MAX_TITLE), body: clip(input.body, MAX_BODY) }
}

export function parseContent(raw: unknown): NotificationContent | null {
  if (typeof raw !== 'object' || raw === null) return null
  const value = raw as Record<string, unknown>
  if (typeof value.title !== 'string' || !value.title) return null
  return {
    taskId: typeof value.taskId === 'string' && value.taskId ? value.taskId : null,
    title: clip(value.title, MAX_TITLE),
    body: typeof value.body === 'string' ? clip(value.body, MAX_BODY) : '',
    badge:
      typeof value.badge === 'number' && Number.isInteger(value.badge) && value.badge >= 0 ? value.badge : null,
    ...(typeof value.at === 'number' && Number.isFinite(value.at) ? { at: value.at } : {}),
    ...(value.overdue === true ? { overdue: true } : {}),
    ...(value.ask === true ? { ask: true } : {}),
  }
}

/** Extrae el contenido cifrado del sobre `{ v: 1, p }` que envía el servidor. */
export function parsePushData(text: string): string | null {
  try {
    const data: unknown = JSON.parse(text)
    if (typeof data !== 'object' || data === null) return null
    const { v, p } = data as Record<string, unknown>
    return v === 1 && typeof p === 'string' && p ? p : null
  } catch {
    return null
  }
}

/** Botones de la notificación. iOS no los muestra; Android y escritorio sí. */
export type NotificationAction = 'done' | 'snooze' | 'today' | 'again'

export const isNotificationAction = (value: unknown): value is NotificationAction =>
  value === 'done' || value === 'snooze' || value === 'today' || value === 'again'

/** Mensaje del service worker a la página cuando ya estaba abierta. */
export interface OpenTaskMessage {
  type: 'open-task'
  taskId: string | null
  action: NotificationAction | null
  /** El aviso preguntaba si la tarea ya estaba hecha: al abrirla se vuelve a preguntar. */
  ask?: boolean
}

export function isOpenTaskMessage(value: unknown): value is OpenTaskMessage {
  if (typeof value !== 'object' || value === null) return false
  const message = value as Record<string, unknown>
  return (
    message.type === 'open-task' &&
    (message.taskId === null || typeof message.taskId === 'string') &&
    (message.action === undefined || message.action === null || isNotificationAction(message.action))
  )
}
