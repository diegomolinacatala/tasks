/** Lo que muestra la notificación. Viaja cifrado; ver `crypto.ts`. */
export interface NotificationContent {
  taskId: string | null
  title: string
  body: string
  /** Número para el icono de la app, o `null` para no tocarlo. */
  badge: number | null
}

const MAX_TITLE = 120
const MAX_BODY = 80

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

/** Mensaje de la página al service worker y viceversa. */
export interface OpenTaskMessage {
  type: 'open-task'
  taskId: string | null
}

export const isOpenTaskMessage = (value: unknown): value is OpenTaskMessage =>
  typeof value === 'object' &&
  value !== null &&
  (value as Record<string, unknown>).type === 'open-task' &&
  ((value as Record<string, unknown>).taskId === null || typeof (value as Record<string, unknown>).taskId === 'string')
