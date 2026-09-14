import { describe, expect, test } from 'vitest'
import { buildPrompt, calendar, readModelJson, sanitizeTasks, workersAiInterpreter } from './interpret'
import { parseInterpretContext } from './validate'

const TODAY = '2026-09-14'

describe('calendar', () => {
  test('dos semanas con día de la semana y marcas de hoy y mañana', () => {
    const lines = calendar(TODAY).split('\n')
    expect(lines).toHaveLength(14)
    expect(lines[0]).toBe('lunes 2026-09-14 (hoy)')
    expect(lines[1]).toBe('martes 2026-09-15 (mañana)')
    expect(lines[3]).toBe('jueves 2026-09-17')
  })
})

describe('buildPrompt', () => {
  test('lleva reglas, hora actual, ejemplo resuelto con la fecha real y la frase', () => {
    const messages = buildPrompt('llamar a Ana', { today: TODAY, now: '10:30' })
    expect(messages.map((m) => m.role)).toEqual(['system', 'user', 'assistant', 'user'])
    expect(messages[0]!.content).toContain('Ahora son las 10:30')
    expect(messages[2]!.content).toContain('"date":"2026-09-15"')
    expect(messages[3]!.content).toBe('llamar a Ana')
  })
})

describe('sanitizeTasks', () => {
  test('acepta la respuesta del ejemplo de la reunión', () => {
    const raw = {
      tasks: [
        {
          title: '  Reunión ',
          date: '2026-09-15',
          time: '17:00',
          reminders: [
            { minutesBefore: 60, atDate: null, atTime: null },
            { minutesBefore: 30, atDate: null, atTime: null },
          ],
        },
      ],
    }
    expect(sanitizeTasks(raw, TODAY)).toEqual([
      {
        title: 'Reunión',
        date: '2026-09-15',
        time: '17:00',
        reminders: [
          { kind: 'before', minutes: 60 },
          { kind: 'before', minutes: 30 },
        ],
      },
    ])
  })

  test('descarta campos inválidos sin tirar la tarea', () => {
    const raw = {
      tasks: [
        {
          title: 'Pagar luz',
          date: '2026-02-31',
          time: '25:00',
          reminders: [
            { minutesBefore: 30, atDate: null, atTime: null },
            { minutesBefore: null, atDate: '2026-09-14', atTime: '21:30' },
            { minutesBefore: -5 },
            'basura',
          ],
        },
      ],
    }
    expect(sanitizeTasks(raw, TODAY)).toEqual([
      { title: 'Pagar luz', date: null, time: null, reminders: [{ kind: 'at', date: '2026-09-14', time: '21:30' }] },
    ])
  })

  test('descarta tareas sin título, fechas absurdas y excesos', () => {
    const many = Array.from({ length: 9 }, (_, i) => ({ title: `T${i}`, date: null, time: null, reminders: [] }))
    expect(sanitizeTasks({ tasks: many }, TODAY)).toHaveLength(5)
    expect(sanitizeTasks({ tasks: [{ title: ' ', date: null, time: null, reminders: [] }] }, TODAY)).toEqual([])
    expect(sanitizeTasks({ tasks: [{ title: 'Viejo', date: '2020-01-01', time: null, reminders: [] }] }, TODAY)[0]!.date).toBeNull()
    expect(sanitizeTasks(null, TODAY)).toEqual([])
    expect(sanitizeTasks({ tasks: 'no' }, TODAY)).toEqual([])
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

describe('workersAiInterpreter', () => {
  test('pide JSON con esquema al modelo y sanea la salida', async () => {
    const calls: Record<string, unknown>[] = []
    const ai = {
      run: async (_model: string, input: Record<string, unknown>) => {
        calls.push(input)
        return { response: { tasks: [{ title: 'Reunión', date: '2026-09-15', time: '17:00', reminders: [] }] } }
      },
    } as unknown as Ai
    const tasks = await workersAiInterpreter(ai).interpret('reunión mañana a las 5', { today: TODAY, now: '10:00' })
    expect(tasks).toEqual([{ title: 'Reunión', date: '2026-09-15', time: '17:00', reminders: [] }])
    expect(calls[0]).toMatchObject({ response_format: { type: 'json_schema' }, temperature: 0 })
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
