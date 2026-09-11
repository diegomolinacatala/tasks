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
      sectionId: 's1',
      order: 0,
      createdAt: 1,
      completedAt: null,
    },
  ],
  sections: [{ id: 's1', name: 'Casa', order: 0, collapsed: false }],
  collapsed: { overdue: false, backlog: true },
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

  test('sella la versión de esquema actual al normalizar', () => {
    expect(normalizeState({ schemaVersion: 1, tasks: [], sections: [] })!.schemaVersion).toBe(SCHEMA_VERSION)
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
