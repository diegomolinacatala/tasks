import { describe, expect, test } from 'vitest'
import { DEFAULT_MODEL, SCHEMA, modelContent, modelInput, readModelJson, sanitizeTasks, workersAiInterpreter } from './interpret'
import { parseInterpretContext } from './validate'

const TODAY = '2026-09-14'
const context = { today: TODAY, now: '10:00' }

const reminder = (fields: Record<string, unknown>) => ({ minutesBefore: null, inMinutes: null, atDate: null, atTime: null, ...fields })
const task = (fields: Record<string, unknown>) => ({ tema: '', cuando: null, avisos: [], date: null, time: null, reminders: [], ...fields })

describe('sanitizeTasks', () => {
  test('la cena de hoy a las 20:00 con aviso media hora antes', () => {
    const raw = {
      tasks: [task({ title: 'Cena', date: TODAY, time: '20:00', reminders: [reminder({ minutesBefore: 30 })] })],
    }
    expect(sanitizeTasks(raw, context)).toEqual([
      { title: 'Cena', date: TODAY, time: '20:00', reminders: [{ kind: 'before', minutes: 30 }] },
    ])
  })

  test('"dentro de N minutos" lo calcula el código sobre la hora local', () => {
    const raw = { tasks: [task({ title: 'Mirar el horno', reminders: [reminder({ inMinutes: 90 })] })] }
    expect(sanitizeTasks(raw, context)[0]!.reminders).toEqual([{ kind: 'at', date: TODAY, time: '11:30' }])
    const late = sanitizeTasks(raw, { today: TODAY, now: '23:50' })
    expect(late[0]!.reminders).toEqual([{ kind: 'at', date: '2026-09-15', time: '01:20' }])
  })

  test('descarta campos inválidos sin tirar la tarea', () => {
    const raw = {
      tasks: [
        task({
          title: 'Pagar luz',
          date: '2026-02-31',
          time: '25:00',
          reminders: [
            reminder({ minutesBefore: 30 }),
            reminder({ atDate: TODAY, atTime: '21:30' }),
            reminder({ minutesBefore: -5 }),
            reminder({ inMinutes: 0 }),
            reminder({ inMinutes: 99_999 }),
            'basura',
          ],
        }),
      ],
    }
    expect(sanitizeTasks(raw, context)).toEqual([
      { title: 'Pagar luz', date: null, time: null, reminders: [{ kind: 'at', date: TODAY, time: '21:30' }] },
    ])
  })

  test('quita avisos repetidos, el punto final y pone mayúscula inicial', () => {
    const raw = {
      tasks: [
        task({
          title: ' reunión con Ana. ',
          date: TODAY,
          time: '17:00',
          reminders: [reminder({ minutesBefore: 60 }), reminder({ minutesBefore: 60 }), reminder({ minutesBefore: 10 })],
        }),
      ],
    }
    expect(sanitizeTasks(raw, context)).toEqual([
      {
        title: 'Reunión con Ana',
        date: TODAY,
        time: '17:00',
        reminders: [
          { kind: 'before', minutes: 60 },
          { kind: 'before', minutes: 10 },
        ],
      },
    ])
  })

  test('el lugar dicho viaja con su nombre y si es al llegar o al salir', () => {
    const raw = {
      tasks: [
        task({ title: 'Comprar pan', placeName: ' Mercadona ', placeOn: 'arrive' }),
        task({ title: 'Coger las llaves', placeName: 'Casa', placeOn: 'leave' }),
      ],
    }
    expect(sanitizeTasks(raw, context)).toEqual([
      { title: 'Comprar pan', date: null, time: null, reminders: [], place: { name: 'Mercadona', on: 'arrive' } },
      { title: 'Coger las llaves', date: null, time: null, reminders: [], place: { name: 'Casa', on: 'leave' } },
    ])
  })

  test('sin nombre o con un sentido inválido no hay lugar', () => {
    const raw = {
      tasks: [
        task({ title: 'A', placeName: 'Mercadona', placeOn: 'pasar' }),
        task({ title: 'B', placeName: '   ', placeOn: 'arrive' }),
        task({ title: 'C', placeName: null, placeOn: null }),
      ],
    }
    expect(sanitizeTasks(raw, context).map((item) => item.place)).toEqual([undefined, undefined, undefined])
  })

  test('descarta tareas sin título, fechas absurdas y excesos', () => {
    const many = Array.from({ length: 9 }, (_, i) => task({ title: `T${i}` }))
    expect(sanitizeTasks({ tasks: many }, context)).toHaveLength(5)
    expect(sanitizeTasks({ tasks: [task({ title: ' ' })] }, context)).toEqual([])
    expect(sanitizeTasks({ tasks: [task({ title: 'Viejo', date: '2020-01-01' })] }, context)[0]!.date).toBeNull()
    expect(sanitizeTasks(null, context)).toEqual([])
    expect(sanitizeTasks({ tasks: 'no' }, context)).toEqual([])
  })
})

describe('modelContent', () => {
  test('lee el formato de Workers AI y el de OpenAI', () => {
    expect(modelContent({ response: { tasks: [] } })).toEqual({ tasks: [] })
    expect(modelContent({ choices: [{ message: { content: '{"tasks":[]}' } }] })).toBe('{"tasks":[]}')
    expect(modelContent({ response: null, choices: [] })).toBeUndefined()
    expect(modelContent('texto')).toBeUndefined()
  })
})

describe('readModelJson', () => {
  test('acepta objeto, texto JSON y texto con bloque de código', () => {
    expect(readModelJson({ tasks: [] })).toEqual({ tasks: [] })
    expect(readModelJson('{"tasks":[]}')).toEqual({ tasks: [] })
    expect(readModelJson('```json\n{"tasks":[]}\n```')).toEqual({ tasks: [] })
    expect(() => readModelJson('no es json')).toThrow()
  })
})

describe('modelInput', () => {
  test('Llama recibe el esquema tal cual; el resto, en formato OpenAI y sin razonamiento', () => {
    expect(modelInput('@cf/meta/llama-3.3-70b-instruct-fp8-fast', 'x', context)).toMatchObject({
      response_format: { type: 'json_schema', json_schema: SCHEMA },
      temperature: 0,
    })
    expect(modelInput(DEFAULT_MODEL, 'x', context)).toMatchObject({
      response_format: { type: 'json_schema', json_schema: { name: 'tareas', schema: SCHEMA, strict: true } },
      temperature: 0,
      chat_template_kwargs: { enable_thinking: false },
    })
  })
})

describe('workersAiInterpreter', () => {
  function fakeAi(output: unknown) {
    const calls: { model: string; input: Record<string, unknown> }[] = []
    const ai = {
      run: async (model: string, input: Record<string, unknown>) => {
        calls.push({ model, input })
        return output
      },
    } as unknown as Ai
    return { ai, calls }
  }

  test('usa el modelo por defecto y sanea la salida', async () => {
    const json = JSON.stringify({ tasks: [task({ title: 'Reunión', date: '2026-09-15', time: '17:00' })] })
    const { ai, calls } = fakeAi({ choices: [{ message: { content: json } }] })
    const tasks = await workersAiInterpreter(ai).interpret('reunión mañana a las 5', context)
    expect(tasks).toEqual([{ title: 'Reunión', date: '2026-09-15', time: '17:00', reminders: [] }])
    expect(calls[0]!.model).toBe(DEFAULT_MODEL)
  })

  test('admite otro modelo', async () => {
    const { ai, calls } = fakeAi({ response: { tasks: [] } })
    expect(await workersAiInterpreter(ai, { model: '@cf/meta/llama-3.3-70b-instruct-fp8-fast' }).interpret('hola', context)).toEqual([])
    expect(calls[0]!.model).toBe('@cf/meta/llama-3.3-70b-instruct-fp8-fast')
  })
})

describe('parseInterpretContext', () => {
  test('exige fecha y hora locales bien formadas', () => {
    expect(parseInterpretContext({ today: TODAY, now: '09:05' })).toEqual({ today: TODAY, now: '09:05' })
    expect(parseInterpretContext({ today: '14/09/2026', now: '09:05' })).toBeNull()
    expect(parseInterpretContext({ today: TODAY, now: '9:05' })).toBeNull()
    expect(parseInterpretContext(undefined)).toBeNull()
  })
})
