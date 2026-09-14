import type { InterpretContext, InterpretedReminder, InterpretedTask, Interpreter } from './types'

const MODEL = '@cf/meta/llama-3.3-70b-instruct-fp8-fast'
const MAX_TASKS = 5
const MAX_REMINDERS = 10
const MAX_TITLE = 200
const MAX_BEFORE_MINUTES = 30 * 24 * 60
const CALENDAR_DAYS = 14
const DAY_MS = 24 * 60 * 60 * 1000
/** Fechas aceptadas: desde ayer (zonas horarias) hasta ~2 años vista. */
const MIN_OFFSET_DAYS = -1
const MAX_OFFSET_DAYS = 800

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/
const WEEKDAYS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']

/** Esquema que el modelo está obligado a seguir. */
const SCHEMA = {
  type: 'object',
  properties: {
    tasks: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          date: { type: ['string', 'null'] },
          time: { type: ['string', 'null'] },
          reminders: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                minutesBefore: { type: ['integer', 'null'] },
                atDate: { type: ['string', 'null'] },
                atTime: { type: ['string', 'null'] },
              },
              required: ['minutesBefore', 'atDate', 'atTime'],
            },
          },
        },
        required: ['title', 'date', 'time', 'reminders'],
      },
    },
  },
  required: ['tasks'],
}

const RULES = `Conviertes frases dictadas en español en tareas de una app de to-do. Respondes solo con JSON.

Cada tarea tiene:
- title: lo que hay que hacer, corto y sin fechas, horas ni avisos. Quita muletillas ("tengo", "tengo que", "recuérdame", "quiero que"). Empieza en mayúscula y respeta nombres propios. "tengo una reunión con Ana" → "Reunión con Ana". "tengo que llamar a Miguel" → "Llamar a Miguel".
- date: día en formato AAAA-MM-DD, o null si no se dice ningún día.
- time: hora en formato HH:MM de 24 h, o null si no se dice hora.
- reminders: avisos que la persona pide explícitamente. Cada uno es relativo o absoluto:
  - relativo a la hora de la tarea: {"minutesBefore": N, "atDate": null, "atTime": null}. "1 hora antes" → 60, "media hora antes" → 30, "10 minutos antes" → 10, "a la hora" → 0, "el día antes" → 1440.
  - absoluto: {"minutesBefore": null, "atDate": "AAAA-MM-DD", "atTime": "HH:MM"}. "avísame a las 9" → ese día a las 09:00. "avísame en 20 minutos" → ahora + 20 minutos.

Reglas:
- Si no pide avisos, reminders es []. No inventes avisos, días ni horas.
- Si pide varios avisos, pon uno por cada uno ("1 hora antes y media hora antes" son dos).
- "hoy", "mañana", "pasado mañana" y los días de la semana se resuelven con el calendario. Un día de la semana es el próximo, nunca hoy.
- "a las 5" sin más es 17:00; "a las 5 de la mañana" es 05:00; "por la mañana" 09:00, "al mediodía" 14:00, "por la tarde" 18:00, "por la noche" 21:00.
- Si hay hora pero no día: hoy si esa hora aún no ha pasado, si no mañana.
- Si la frase contiene varias tareas distintas, devuelve varias. Si no hay ninguna tarea, devuelve {"tasks": []}.`

const EXAMPLE_INPUT = 'tengo una reunión mañana a las 17:00, quiero que me lo recuerdes 1 hora antes y media hora antes'

/** Calendario explícito: los modelos fallan más calculando "el jueves" que leyéndolo. */
export function calendar(today: string): string {
  const base = Date.parse(`${today}T12:00:00Z`)
  return Array.from({ length: CALENDAR_DAYS }, (_, offset) => {
    const date = new Date(base + offset * DAY_MS)
    const iso = date.toISOString().slice(0, 10)
    const label = offset === 0 ? ' (hoy)' : offset === 1 ? ' (mañana)' : offset === 2 ? ' (pasado mañana)' : ''
    return `${WEEKDAYS[date.getUTCDay()]} ${iso}${label}`
  }).join('\n')
}

function exampleOutput(today: string): string {
  const tomorrow = new Date(Date.parse(`${today}T12:00:00Z`) + DAY_MS).toISOString().slice(0, 10)
  return JSON.stringify({
    tasks: [
      {
        title: 'Reunión',
        date: tomorrow,
        time: '17:00',
        reminders: [
          { minutesBefore: 60, atDate: null, atTime: null },
          { minutesBefore: 30, atDate: null, atTime: null },
        ],
      },
    ],
  })
}

export function buildPrompt(text: string, context: InterpretContext) {
  return [
    { role: 'system' as const, content: `${RULES}\n\nAhora son las ${context.now}. Calendario:\n${calendar(context.today)}` },
    { role: 'user' as const, content: EXAMPLE_INPUT },
    { role: 'assistant' as const, content: exampleOutput(context.today) },
    { role: 'user' as const, content: text },
  ]
}

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null

function isRealDate(value: unknown, today: string): value is string {
  if (typeof value !== 'string' || !DATE_RE.test(value)) return false
  const time = Date.parse(`${value}T12:00:00Z`)
  if (Number.isNaN(time) || new Date(time).toISOString().slice(0, 10) !== value) return false
  const offset = Math.round((time - Date.parse(`${today}T12:00:00Z`)) / DAY_MS)
  return offset >= MIN_OFFSET_DAYS && offset <= MAX_OFFSET_DAYS
}

const isTime = (value: unknown): value is string => typeof value === 'string' && TIME_RE.test(value)

/** Nunca se confía en la salida del modelo: todo lo que no cumple el formato se descarta. */
export function sanitizeTasks(raw: unknown, today: string): InterpretedTask[] {
  const list = isObject(raw) && Array.isArray(raw.tasks) ? raw.tasks : []
  return list.slice(0, MAX_TASKS).flatMap((item): InterpretedTask[] => {
    if (!isObject(item) || typeof item.title !== 'string') return []
    const title = item.title.replace(/\s+/g, ' ').trim().slice(0, MAX_TITLE)
    if (!title) return []
    const date = isRealDate(item.date, today) ? item.date : null
    const time = isTime(item.time) ? item.time : null
    const rawReminders: unknown[] = Array.isArray(item.reminders) ? item.reminders : []
    const reminders = rawReminders.slice(0, MAX_REMINDERS).flatMap((reminder): InterpretedReminder[] => {
      if (!isObject(reminder)) return []
      const minutes = reminder.minutesBefore
      if (typeof minutes === 'number' && Number.isInteger(minutes) && minutes >= 0 && minutes <= MAX_BEFORE_MINUTES) {
        // Un aviso relativo sin hora de tarea no tendría cuándo sonar.
        return time ? [{ kind: 'before', minutes }] : []
      }
      if (isRealDate(reminder.atDate, today) && isTime(reminder.atTime)) {
        return [{ kind: 'at', date: reminder.atDate, time: reminder.atTime }]
      }
      return []
    })
    return [{ title, date, time, reminders }]
  })
}

/** Workers AI a veces devuelve el JSON ya parseado y a veces como texto (con o sin ```). */
export function readModelJson(response: unknown): unknown {
  if (typeof response !== 'string') return response
  const text = response.trim().replace(/^```(?:json)?\s*|\s*```$/g, '')
  return JSON.parse(text)
}

export function workersAiInterpreter(ai: Ai): Interpreter {
  return {
    async interpret(text, context) {
      const output = await ai.run(MODEL, {
        messages: buildPrompt(text, context),
        response_format: { type: 'json_schema', json_schema: SCHEMA },
        temperature: 0,
        max_tokens: 800,
      })
      const response = isObject(output) ? output.response : undefined
      return sanitizeTasks(readModelJson(response), context.today)
    },
  }
}
