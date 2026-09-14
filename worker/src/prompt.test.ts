import { describe, expect, test } from 'vitest'
import { SCHEMA, sanitizeTasks } from './interpret'
import { addDaysIso, buildPrompt, calendar } from './prompt'

const MONDAY = '2026-09-14'
const context = { today: MONDAY, now: '10:30' }

describe('addDaysIso', () => {
  test('cruza meses y años', () => {
    expect(addDaysIso('2026-09-30', 1)).toBe('2026-10-01')
    expect(addDaysIso('2026-12-31', 1)).toBe('2027-01-01')
    expect(addDaysIso('2026-03-01', -1)).toBe('2026-02-28')
  })
})

describe('calendar', () => {
  test('un lunes: tres semanas completas con hoy, mañana y pasado mañana marcados', () => {
    const lines = calendar(MONDAY).split('\n')
    expect(lines.slice(0, 4)).toEqual(['Esta semana:', 'lunes 2026-09-14 (hoy)', 'martes 2026-09-15 (mañana)', 'miércoles 2026-09-16 (pasado mañana)'])
    expect(lines[lines.indexOf('Semana que viene:') + 1]).toBe('lunes 2026-09-21')
    expect(lines[lines.indexOf('Dentro de dos semanas:') + 1]).toBe('lunes 2026-09-28')
    expect(lines.at(-1)).toBe('domingo 2026-10-04')
    expect(lines).toHaveLength(21 + 3)
  })

  test('un domingo: esta semana solo tiene hoy y la siguiente empieza mañana', () => {
    const lines = calendar('2026-09-20').split('\n')
    expect(lines.slice(0, 4)).toEqual(['Esta semana:', 'domingo 2026-09-20 (hoy)', 'Semana que viene:', 'lunes 2026-09-21 (mañana)'])
    expect(lines.at(-1)).toBe('domingo 2026-10-04')
  })
})

describe('buildPrompt', () => {
  const messages = buildPrompt('llamar a Ana', context)

  test('reglas y calendario, ejemplos como conversación y la frase al final', () => {
    expect(messages.map((m) => m.role)).toEqual(['system', ...Array(5).fill(['user', 'assistant']).flat(), 'user'])
    expect(messages[0]!.content).toContain('Ahora es lunes 2026-09-14, a las 10:30')
    expect(messages[0]!.content).toContain('lunes 2026-09-14 (hoy)')
    expect(messages.at(-1)!.content).toBe('llamar a Ana')
  })

  test('los ejemplos usan las fechas reales de hoy', () => {
    const [cena, moto, , teatro] = messages.filter((m) => m.role === 'assistant').map((m) => JSON.parse(m.content))
    expect(cena.tasks[0]).toMatchObject({ title: 'Cena', date: MONDAY, time: '20:00' })
    expect(moto.tasks[0].date).toBe('2026-09-17')
    expect(teatro.tasks[0].reminders[0]).toMatchObject({ atDate: '2026-09-16', atTime: '18:00' })
    // Si hoy es jueves, "el jueves" es el de la semana siguiente.
    const fromThursday = buildPrompt('x', { today: '2026-09-17', now: '10:00' }).filter((m) => m.role === 'assistant')
    expect(JSON.parse(fromThursday[1]!.content).tasks[0].date).toBe('2026-09-24')
  })

  test('cada ejemplo cumple el esquema y sobrevive a la validación', () => {
    const taskKeys = Object.keys(SCHEMA.properties.tasks.items.properties).sort()
    const reminderKeys = Object.keys(SCHEMA.properties.tasks.items.properties.reminders.items.properties).sort()
    const outputs = messages.filter((m) => m.role === 'assistant').map((m) => JSON.parse(m.content))
    for (const output of outputs) {
      for (const task of output.tasks) {
        expect(Object.keys(task).sort()).toEqual(taskKeys)
        for (const reminder of task.reminders) expect(Object.keys(reminder).sort()).toEqual(reminderKeys)
      }
      expect(sanitizeTasks(output, context)).toHaveLength(output.tasks.length)
    }
  })
})
