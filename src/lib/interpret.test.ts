import { describe, expect, test } from 'vitest'
import { toInstant } from './date'
import { draftsFromInterpreted } from './interpret'
import { parseSpoken } from './parse'

// Lunes 14 de septiembre de 2026, 10:00 hora local.
const NOW = toInstant('2026-09-14', '10:00')

describe('draftsFromInterpreted', () => {
  test('la reunión con dos avisos queda como una tarea con dos recordatorios', () => {
    const raw = [
      {
        title: 'Reunión',
        date: '2026-09-15',
        time: '17:00',
        reminders: [
          { kind: 'before', minutes: 60 },
          { kind: 'before', minutes: 30 },
        ],
      },
    ]
    expect(draftsFromInterpreted(raw, NOW)).toEqual([
      {
        title: 'Reunión',
        date: '2026-09-15',
        time: '17:00',
        reminders: [
          { kind: 'before', minutes: 60 },
          { kind: 'before', minutes: 30 },
        ],
        label: 'Mañana 17:00 · 1 h antes · 30 min antes',
      },
    ])
  })

  test('varias tareas en una frase', () => {
    const raw = [
      { title: 'Llamar a mamá', date: '2026-09-14', time: null, reminders: [] },
      { title: 'Gimnasio', date: '2026-09-14', time: '19:00', reminders: [] },
    ]
    const drafts = draftsFromInterpreted(raw, NOW)!
    expect(drafts.map((d) => d.title)).toEqual(['Llamar a mamá', 'Gimnasio'])
    // Con hora y sin avisos pedidos, el aviso automático a la hora.
    expect(drafts[1]!.reminders).toEqual([{ kind: 'before', minutes: 0 }])
    expect(drafts[1]!.label).toBe('Hoy 19:00')
  })

  test('convierte avisos absolutos a la hora local y descarta los pasados', () => {
    const raw = [
      {
        title: 'Basura',
        date: '2026-09-14',
        time: null,
        reminders: [
          { kind: 'at', date: '2026-09-14', time: '21:30' },
          { kind: 'at', date: '2026-09-14', time: '08:00' },
        ],
      },
    ]
    expect(draftsFromInterpreted(raw, NOW)![0]!.reminders).toEqual([{ kind: 'at', at: toInstant('2026-09-14', '21:30') }])
  })

  test('sin día pero con aviso a hora concreta, la tarea es para el día del aviso', () => {
    const raw = [{ title: 'Mirar el horno', date: null, time: null, reminders: [{ kind: 'at', date: '2026-09-14', time: '10:30' }] }]
    expect(draftsFromInterpreted(raw, NOW)![0]).toMatchObject({ date: '2026-09-14', label: 'Hoy 10:30' })
  })

  test('hora sin día: hoy si no ha pasado, si no mañana', () => {
    const later = draftsFromInterpreted([{ title: 'A', date: null, time: '12:00', reminders: [] }], NOW)!
    const earlier = draftsFromInterpreted([{ title: 'B', date: null, time: '09:00', reminders: [] }], NOW)!
    expect(later[0]!.date).toBe('2026-09-14')
    expect(earlier[0]!.date).toBe('2026-09-15')
  })

  test('sanea lo inválido y devuelve null si no queda nada', () => {
    const raw = [
      { title: 'Ok', date: '2026-02-31', time: '7:00', reminders: [{ kind: 'before', minutes: 30 }, 'x', { kind: 'otro' }] },
      { title: '  ', date: null, time: null, reminders: [] },
      'basura',
    ]
    expect(draftsFromInterpreted(raw, NOW)).toEqual([{ title: 'Ok', date: null, time: null, reminders: [], label: '' }])
    expect(draftsFromInterpreted([], NOW)).toBeNull()
    expect(draftsFromInterpreted(null, NOW)).toBeNull()
    expect(draftsFromInterpreted({ tasks: [] }, NOW)).toBeNull()
  })
})

describe('analizador local como respaldo', () => {
  test('entiende también el ejemplo de la reunión', () => {
    const text = 'tengo una reunión mañana a las 17:00, quiero que me lo recuerdes 1 hora antes y media hora antes'
    expect(parseSpoken(text, NOW)).toMatchObject({
      title: 'Reunión',
      date: '2026-09-15',
      time: '17:00',
      reminders: [
        { kind: 'before', minutes: 60 },
        { kind: 'before', minutes: 30 },
      ],
    })
  })
})
