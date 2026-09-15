import { addDaysIso, buildPrompt } from './prompt'
import type { InterpretContext, InterpretedReminder, InterpretedTask, Interpreter } from './types'

/**
 * Elegido con `npm run eval` entre los modelos del plan gratuito: el más fiable que responde
 * en ~1 s. Llama 3.3 70B, Llama 4 Scout, Gemma 4, GLM 4.7 y Qwen 3.8 fallan más o tardan
 * hasta decenas de segundos en algunas frases.
 */
export const DEFAULT_MODEL = '@cf/nvidia/nemotron-3-120b-a12b'
const MAX_TASKS = 5
const MAX_REMINDERS = 10
const MAX_TITLE = 200
const MAX_PLACE_NAME = 60
const MAX_BEFORE_MINUTES = 30 * 24 * 60
const MAX_IN_MINUTES = 7 * 24 * 60
const MAX_TOKENS = 1200
const DAY_MS = 24 * 60 * 60 * 1000
/** Fechas aceptadas: desde ayer (zonas horarias) hasta ~2 años vista. */
const MIN_OFFSET_DAYS = -1
const MAX_OFFSET_DAYS = 800

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/

const nullable = (type: string) => ({ type: [type, 'null'] })

/**
 * Esquema que el modelo está obligado a seguir. El orden importa: el modelo escribe primero
 * los fragmentos literales (tema, cuándo, avisos) y después los convierte.
 */
export const SCHEMA = {
  type: 'object',
  properties: {
    tasks: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          tema: { type: 'string' },
          cuando: nullable('string'),
          avisos: { type: 'array', items: { type: 'string' } },
          lugar: nullable('string'),
          title: { type: 'string' },
          date: nullable('string'),
          time: nullable('string'),
          reminders: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                minutesBefore: nullable('integer'),
                inMinutes: nullable('integer'),
                atDate: nullable('string'),
                atTime: nullable('string'),
              },
              required: ['minutesBefore', 'inMinutes', 'atDate', 'atTime'],
              additionalProperties: false,
            },
          },
          placeName: nullable('string'),
          placeOn: nullable('string'),
        },
        required: ['tema', 'cuando', 'avisos', 'lugar', 'title', 'date', 'time', 'reminders', 'placeName', 'placeOn'],
        additionalProperties: false,
      },
    },
  },
  required: ['tasks'],
  additionalProperties: false,
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

const isMinutes = (value: unknown, max: number): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= max

/** "Dentro de N minutos" en hora local del móvil: la cuenta la hace el código, no el modelo. */
function localPlus(context: InterpretContext, minutes: number): { date: string; time: string } {
  const [hours = 0, mins = 0] = context.now.split(':').map(Number)
  const total = hours * 60 + mins + minutes
  const days = Math.floor(total / (24 * 60))
  const rest = total - days * 24 * 60
  const pad = (n: number) => String(n).padStart(2, '0')
  return { date: addDaysIso(context.today, days), time: `${pad(Math.floor(rest / 60))}:${pad(rest % 60)}` }
}

function reminderOf(raw: unknown, hasTime: boolean, context: InterpretContext): InterpretedReminder | null {
  if (!isObject(raw)) return null
  if (isMinutes(raw.inMinutes, MAX_IN_MINUTES) && raw.inMinutes > 0) {
    return { kind: 'at', ...localPlus(context, raw.inMinutes) }
  }
  // Un aviso relativo sin hora de tarea no tendría cuándo sonar.
  if (isMinutes(raw.minutesBefore, MAX_BEFORE_MINUTES)) return hasTime ? { kind: 'before', minutes: raw.minutesBefore } : null
  if (isRealDate(raw.atDate, context.today) && isTime(raw.atTime)) return { kind: 'at', date: raw.atDate, time: raw.atTime }
  return null
}

function placeOf(item: Record<string, unknown>): InterpretedTask['place'] {
  const name = typeof item.placeName === 'string' ? item.placeName.replace(/\s+/g, ' ').trim().slice(0, MAX_PLACE_NAME) : ''
  if (!name || (item.placeOn !== 'arrive' && item.placeOn !== 'leave')) return undefined
  return { name, on: item.placeOn }
}

const reminderKey = (reminder: InterpretedReminder) =>
  reminder.kind === 'before' ? `before:${reminder.minutes}` : `at:${reminder.date} ${reminder.time}`

/** Nunca se confía en la salida del modelo: todo lo que no cumple el formato se descarta. */
export function sanitizeTasks(raw: unknown, context: InterpretContext): InterpretedTask[] {
  const list = isObject(raw) && Array.isArray(raw.tasks) ? raw.tasks : []
  return list.slice(0, MAX_TASKS).flatMap((item): InterpretedTask[] => {
    if (!isObject(item) || typeof item.title !== 'string') return []
    const title = item.title.replace(/\s+/g, ' ').trim().replace(/[.,;:]+$/, '').trim().slice(0, MAX_TITLE)
    if (!title) return []
    const date = isRealDate(item.date, context.today) ? item.date : null
    const time = isTime(item.time) ? item.time : null
    const rawReminders: unknown[] = Array.isArray(item.reminders) ? item.reminders : []
    const seen = new Set<string>()
    const reminders = rawReminders.slice(0, MAX_REMINDERS).flatMap((entry): InterpretedReminder[] => {
      const reminder = reminderOf(entry, time !== null, context)
      if (!reminder || seen.has(reminderKey(reminder))) return []
      seen.add(reminderKey(reminder))
      return [reminder]
    })
    const place = placeOf(item)
    const base = { title: title.charAt(0).toUpperCase() + title.slice(1), date, time, reminders }
    return [place ? { ...base, place } : base]
  })
}

/** Texto de la respuesta: los modelos antiguos lo dan en `response`; los nuevos, al estilo OpenAI. */
export function modelContent(output: unknown): unknown {
  if (!isObject(output)) return undefined
  if (output.response !== undefined && output.response !== null) return output.response
  const choice = Array.isArray(output.choices) ? output.choices[0] : undefined
  return isObject(choice) && isObject(choice.message) ? choice.message.content : undefined
}

/** Workers AI a veces devuelve el JSON ya parseado y a veces como texto (con o sin ```). */
export function readModelJson(response: unknown): unknown {
  if (typeof response !== 'string') return response
  const text = response.trim().replace(/^```(?:json)?\s*|\s*```$/g, '')
  return JSON.parse(text)
}

/** Parámetros de la llamada: Llama usa el formato propio de Workers AI; el resto, el de OpenAI. */
export function modelInput(model: string, text: string, context: InterpretContext): Record<string, unknown> {
  const messages = buildPrompt(text, context)
  if (model.startsWith('@cf/meta/')) {
    return { messages, response_format: { type: 'json_schema', json_schema: SCHEMA }, temperature: 0, max_tokens: MAX_TOKENS }
  }
  return {
    messages,
    response_format: { type: 'json_schema', json_schema: { name: 'tareas', schema: SCHEMA, strict: true } },
    temperature: 0,
    max_completion_tokens: MAX_TOKENS,
    // El razonamiento añade segundos de espera y no mejora una tarea tan acotada.
    chat_template_kwargs: { enable_thinking: false },
  }
}

type RunModel = (model: string, input: Record<string, unknown>) => Promise<unknown>

export function workersAiInterpreter(ai: Ai, options: { model?: string } = {}): Interpreter {
  const model = options.model ?? DEFAULT_MODEL
  const run = ai.run.bind(ai) as unknown as RunModel
  return {
    async interpret(text, context) {
      const output = await run(model, modelInput(model, text, context))
      return sanitizeTasks(readModelJson(modelContent(output)), context)
    },
  }
}
