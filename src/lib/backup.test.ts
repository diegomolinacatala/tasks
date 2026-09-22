import { describe, expect, test } from 'vitest'
import type { AppState } from '../types'
import { SCHEMA_VERSION } from '../state/reducer'
import { backupFilename, normalizeState, parseBackup, serializeBackup } from './backup'

const state: AppState = {
  schemaVersion: SCHEMA_VERSION,
  tasks: [
    {
      id: 't1',
      title: 'Comprar pan',
      done: false,
      date: '2026-09-11',
      time: null,
      duration: null,
      reminders: [],
      sectionId: 's1',
      order: 0,
      createdAt: 1,
      importance: 1,
      completedAt: null,
    },
  ],
  sections: [{ id: 's1', name: 'Casa', order: 0, collapsed: false }],
  places: [{ id: 'p1', name: 'Mercadona', location: { lat: 39.47, lng: -0.38, address: 'Calle Colón 1' }, radius: 150 }],
  collapsed: { overdue: false, backlog: true },
  settings: { digest: { enabled: false, time: '08:30' }, dictation: false },
}

describe('serializeBackup / parseBackup', () => {
  test('ida y vuelta conserva el estado', () => {
    expect(parseBackup(serializeBackup(state))).toEqual(state)
  })

  test('el fichero declara app y fecha de exportación', () => {
    const file = JSON.parse(serializeBackup(state, new Date('2026-09-11T10:00:00Z')))
    expect(file.app).toBe('tasks')
    expect(file.exportedAt).toBe('2026-09-11T10:00:00.000Z')
  })

  test('rechaza JSON inválido con mensaje legible', () => {
    expect(() => parseBackup('{no soy json')).toThrow(/JSON/)
  })

  test('rechaza JSON válido con forma incorrecta', () => {
    expect(() => parseBackup('{"foo":1}')).toThrow(/copia de Tasks/)
  })
})

describe('normalizeState', () => {
  test('descarta tareas sin id o sin título', () => {
    const result = normalizeState({ tasks: [{ id: 'a' }, { title: 'b' }, { id: 'c', title: 'ok' }], sections: [] })
    expect(result!.tasks.map((t) => t.id)).toEqual(['c'])
  })

  test('desvincula tareas que apuntan a una sección inexistente', () => {
    const result = normalizeState({
      tasks: [{ id: 'a', title: 'x', sectionId: 'fantasma' }],
      sections: [],
    })
    expect(result!.tasks[0]!.sectionId).toBeNull()
  })

  test('una tarea sin fecha no conserva sección', () => {
    const result = normalizeState({
      tasks: [{ id: 'a', title: 'x', date: null, sectionId: 's1' }],
      sections: [{ id: 's1', name: 'Casa' }],
    })
    expect(result!.tasks[0]!.sectionId).toBeNull()
  })

  test('ignora fechas con formato inválido', () => {
    const result = normalizeState({ tasks: [{ id: 'a', title: 'x', date: '11/09/2026' }], sections: [] })
    expect(result!.tasks[0]!.date).toBeNull()
  })

  test('acepta un AppState suelto además del fichero envuelto', () => {
    expect(normalizeState(state)).toEqual(state)
    expect(normalizeState({ state })).toEqual(state)
  })

  test('rellena los bloques plegados que falten en copias antiguas', () => {
    const result = normalizeState({ tasks: [], sections: [] })
    expect(result!.collapsed).toEqual({ overdue: false, backlog: false })
  })

  test('la importancia se sanea: sin ella (copias anteriores) es normal y nunca sale de 1 a 10', () => {
    const result = normalizeState({
      tasks: [
        { id: 'antigua', title: 'x' },
        { id: 'grande', title: 'x', importance: 8 },
        { id: 'enorme', title: 'x', importance: 50 },
        { id: 'rara', title: 'x', importance: 'mucha' },
      ],
      sections: [],
    })
    expect(result!.tasks.map((t) => t.importance)).toEqual([1, 8, 10, 1])
  })

  test('sella la versión de esquema actual al normalizar', () => {
    expect(normalizeState({ schemaVersion: 1, tasks: [], sections: [] })!.schemaVersion).toBe(SCHEMA_VERSION)
  })

  test('el permiso del dictado solo cuenta si es exactamente true (copias antiguas: sin permiso)', () => {
    const settings = (dictation: unknown) => normalizeState({ tasks: [], sections: [], settings: { dictation } })!.settings
    expect(normalizeState({ schemaVersion: 7, tasks: [], sections: [] })!.settings.dictation).toBe(false)
    expect(settings(true).dictation).toBe(true)
    expect(settings('true').dictation).toBe(false)
    expect(settings(true).digest).toEqual({ enabled: false, time: '08:30' })
  })

  test('devuelve null si faltan las colecciones', () => {
    expect(normalizeState({ tasks: [] })).toBeNull()
    expect(normalizeState(null)).toBeNull()
  })
})

describe('backupFilename', () => {
  test('incluye la fecha local con ceros', () => {
    expect(backupFilename(new Date(2026, 0, 5))).toBe('tasks-2026-01-05.json')
  })
})

describe('migración v2 → v3', () => {
  test('una tarea antigua recibe hora nula y lista de recordatorios vacía', () => {
    const result = normalizeState({ schemaVersion: 2, tasks: [{ id: 'a', title: 'x' }], sections: [] })
    expect(result!.tasks[0]).toMatchObject({ time: null, reminders: [] })
  })

  test('sanea hora y recordatorios, sin ids repetidos', () => {
    const result = normalizeState({
      tasks: [
        {
          id: 'a',
          title: 'x',
          time: '7:00',
          reminders: [
            { id: 'r1', kind: 'at', at: 10 },
            { id: 'r1', kind: 'at', at: 20 },
            { id: 'r2', kind: 'before', minutes: -5 },
            { id: 'r3', kind: 'before', minutes: 15 },
          ],
        },
      ],
      sections: [],
    })
    expect(result!.tasks[0]!.time).toBeNull()
    expect(result!.tasks[0]!.reminders.map((r) => r.id)).toEqual(['r1', 'r3'])
  })

  test('limita los recordatorios por tarea', () => {
    const reminders = Array.from({ length: 30 }, (_, i) => ({ id: `r${i}`, kind: 'at', at: i + 1 }))
    const result = normalizeState({ tasks: [{ id: 'a', title: 'x', reminders }], sections: [] })
    expect(result!.tasks[0]!.reminders).toHaveLength(20)
  })
})

describe('migración v4 → v5: lugares', () => {
  test('una copia sin lugares arranca con la lista vacía', () => {
    expect(normalizeState({ schemaVersion: 4, tasks: [], sections: [] })!.places).toEqual([])
  })

  test('quita los avisos que apuntan a un lugar inexistente y los lugares repetidos', () => {
    const result = normalizeState({
      tasks: [
        {
          id: 'a',
          title: 'x',
          reminders: [
            { id: 'r1', kind: 'place', placeId: 'p1', on: 'arrive' },
            { id: 'r2', kind: 'place', placeId: 'fantasma', on: 'arrive' },
          ],
        },
      ],
      sections: [],
      places: [
        { id: 'p1', name: 'Mercadona' },
        { id: 'p1', name: 'Otro' },
        { id: 'p2', name: '' },
      ],
    })
    expect(result!.places.map((place) => place.name)).toEqual(['Mercadona'])
    expect(result!.tasks[0]!.reminders.map((reminder) => reminder.id)).toEqual(['r1'])
  })
})

describe('duración', () => {
  test('una copia anterior a la duración se importa sin ella', () => {
    const state = normalizeState({ tasks: [{ id: 'a', title: 'Reunión', date: '2026-09-11', time: '17:30' }], sections: [] })
    expect(state!.tasks[0]!.duration).toBeNull()
  })

  test('se conserva saneada', () => {
    const raw = (duration: unknown) => ({ tasks: [{ id: 'a', title: 'A', duration }], sections: [] })
    expect(normalizeState(raw(45))!.tasks[0]!.duration).toBe(45)
    expect(normalizeState(raw(99_999))!.tasks[0]!.duration).toBe(720)
    expect(normalizeState(raw('60'))!.tasks[0]!.duration).toBeNull()
  })
})
