import { describe, expect, test } from 'vitest'
import { emptyState } from '../state/reducer'
import type { AppState } from '../types'
import type { InboxEntry } from './inbox'
import { MAX_INBOX_ENTRIES, applyInbox } from './inbox'
import { parseInbox, settleSaved } from './inboxFile'

const NOW = new Date(2026, 8, 18, 10, 0).getTime()

const entry = (partial: Partial<InboxEntry> = {}): InboxEntry => ({
  id: 'e1',
  createdAt: NOW,
  places: [],
  tasks: [{ id: 't1', title: 'Llamar a Ana', date: '2026-09-18', time: '17:00', reminders: [{ kind: 'before', minutes: 10 }] }],
  ...partial,
})

describe('parseInbox', () => {
  const valid = {
    id: 'e1',
    createdAt: NOW,
    places: [{ id: 'p1', name: 'Casa' }],
    tasks: [
      {
        id: 't1',
        title: '  Llamar a Ana ',
        date: '2026-09-18',
        time: '17:00',
        reminders: [
          { kind: 'before', minutes: 10 },
          { kind: 'at', at: NOW + 60_000 },
          { kind: 'place', placeId: 'p1', on: 'arrive' },
        ],
      },
    ],
  }

  test('acepta lo que escribe el lado nativo', () => {
    expect(parseInbox([valid])).toEqual([
      {
        ...valid,
        tasks: [{ ...valid.tasks[0], title: 'Llamar a Ana' }],
      },
    ])
  })

  test('lo que no es una lista no trae nada', () => {
    expect(parseInbox(null)).toEqual([])
    expect(parseInbox({ entries: [] })).toEqual([])
  })

  test('descarta tareas y avisos mal formados sin perder el resto', () => {
    const [parsed] = parseInbox([
      {
        ...valid,
        places: [{ id: 'p1', name: '' }, { id: '', name: 'Sin id' }, { id: 'p2', name: 'Gimnasio' }],
        tasks: [
          { id: 't1', title: '', date: null, time: null, reminders: [] },
          { id: 't2', title: 'Día imposible', date: '2026-02-30', time: null, reminders: [] },
          { id: 't3', title: 'Hora rara', date: '2026-09-18', time: '25:00', reminders: [{ kind: 'before', minutes: -5 }, { kind: 'nada' }] },
        ],
      },
    ])
    expect(parsed?.places).toEqual([{ id: 'p2', name: 'Gimnasio' }])
    expect(parsed?.tasks).toEqual([
      { id: 't2', title: 'Día imposible', date: null, time: null, reminders: [] },
      { id: 't3', title: 'Hora rara', date: '2026-09-18', time: null, reminders: [] },
    ])
  })

  test('una entrada de solo texto conserva el texto, arreglado', () => {
    expect(parseInbox([{ id: 'x', createdAt: NOW, text: '  comprar   pan ' }])).toEqual([
      { id: 'x', createdAt: NOW, places: [], tasks: [], text: 'comprar pan' },
    ])
  })

  test('una entrada sin id se descarta entera', () => {
    expect(parseInbox([{ ...valid, id: '' }, { ...valid, id: 'e2', createdAt: 'ayer' }])).toEqual([])
  })

  test(`como mucho ${MAX_INBOX_ENTRIES} entradas`, () => {
    const many = Array.from({ length: MAX_INBOX_ENTRIES + 5 }, (_, index) => ({ ...valid, id: `e${index}` }))
    expect(parseInbox(many)).toHaveLength(MAX_INBOX_ENTRIES)
  })
})

describe('settleSaved', () => {
  const awaiting = (id: string, taskId: string, misses = 0) => ({
    entry: entry({ id, tasks: [{ id: taskId, title: taskId, date: null, time: null, reminders: [] }] }),
    misses,
  })
  const savedWith = (...ids: string[]): AppState =>
    applyInbox(emptyState(), [entry({ tasks: ids.map((id) => ({ id, title: id, date: null, time: null, reminders: [] })) })]).state

  test('en cuanto sus tareas están en lo guardado, se puede borrar de la bandeja', () => {
    expect(settleSaved([awaiting('e1', 't1'), awaiting('e2', 't2')], savedWith('t1'))).toEqual({
      settled: ['e1'],
      awaiting: [awaiting('e2', 't2', 1)],
    })
  })

  test('si en la siguiente escritura siguen sin estar, se descartaron: no se vuelve a aplicar', () => {
    expect(settleSaved([awaiting('e2', 't2', 1)], savedWith())).toEqual({ settled: ['e2'], awaiting: [] })
  })

  test('una entrada sin tareas (solo lugares) queda resuelta en la primera escritura', () => {
    expect(settleSaved([{ entry: entry({ tasks: [] }), misses: 0 }], savedWith()).settled).toEqual(['e1'])
  })
})
