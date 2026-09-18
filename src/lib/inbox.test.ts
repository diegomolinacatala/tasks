import { describe, expect, test } from 'vitest'
import { emptyState } from '../state/reducer'
import type { AppState, Place, TaskDraft } from '../types'
import { applyInbox, entryFromDrafts, entryTaskIds, resolveEntry } from './inbox'
import type { InboxEntry } from './inbox'

const NOW = new Date(2026, 8, 18, 10, 0).getTime()

const place = (id: string, name: string): Place => ({ id, name, location: null, radius: 150 })

const draft = (partial: Partial<TaskDraft> = {}): TaskDraft => ({
  title: 'Comprar pan',
  date: null,
  time: null,
  reminders: [],
  ...partial,
})

/** Ids previsibles: `id-1`, `id-2`… */
function sequence() {
  let count = 0
  return () => `id-${++count}`
}

const entry = (partial: Partial<InboxEntry> = {}): InboxEntry => ({
  id: 'e1',
  createdAt: NOW,
  places: [],
  tasks: [{ id: 't1', title: 'Llamar a Ana', date: '2026-09-18', time: '17:00', reminders: [{ kind: 'before', minutes: 10 }] }],
  ...partial,
})

const withPlaces = (...places: Place[]): AppState => ({ ...emptyState(), places })

describe('entryFromDrafts', () => {
  test('da un id a cada tarea y conserva lo que se entendió', () => {
    const result = entryFromDrafts(
      [draft({ date: '2026-09-19', time: '09:00', reminders: [{ kind: 'before', minutes: 0 }] })],
      [],
      sequence(),
      NOW,
    )
    expect(result).toEqual({
      id: 'id-2',
      createdAt: NOW,
      places: [],
      tasks: [{ id: 'id-1', title: 'Comprar pan', date: '2026-09-19', time: '09:00', reminders: [{ kind: 'before', minutes: 0 }] }],
    })
  })

  test('un lugar nuevo se crea una sola vez aunque lo nombren varias tareas', () => {
    const newPlace = { name: 'Mercadona', on: 'arrive' as const }
    const result = entryFromDrafts([draft({ newPlace }), draft({ title: 'Leche', newPlace: { ...newPlace, name: 'mercadona' } })], [], sequence(), NOW)
    expect(result.places).toEqual([{ id: 'id-1', name: 'Mercadona' }])
    expect(result.tasks.map((task) => task.reminders)).toEqual([
      [{ kind: 'place', placeId: 'id-1', on: 'arrive' }],
      [{ kind: 'place', placeId: 'id-1', on: 'arrive' }],
    ])
  })

  test('si el lugar ya está guardado, usa el suyo', () => {
    const result = entryFromDrafts([draft({ newPlace: { name: 'el mercadona', on: 'leave' } })], [place('p1', 'Mercadona')], sequence(), NOW)
    expect(result.places).toEqual([])
    expect(result.tasks[0]?.reminders).toEqual([{ kind: 'place', placeId: 'p1', on: 'leave' }])
  })
})

describe('applyInbox', () => {
  test('crea los lugares antes que las tareas que los usan', () => {
    const { actions } = applyInbox(emptyState(), [
      entry({
        places: [{ id: 'p1', name: 'Mercadona' }],
        tasks: [{ id: 't1', title: 'Leche', date: null, time: null, reminders: [{ kind: 'place', placeId: 'p1', on: 'arrive' }] }],
      }),
    ])
    expect(actions.map((action) => action.type)).toEqual(['place/add', 'task/add'])
  })

  test('las tareas llegan sin sección y con sus avisos', () => {
    const { state } = applyInbox(emptyState(), [entry()])
    expect(state.tasks).toHaveLength(1)
    expect(state.tasks[0]).toMatchObject({ id: 't1', title: 'Llamar a Ana', date: '2026-09-18', time: '17:00', sectionId: null, done: false })
    expect(state.tasks[0]?.reminders).toMatchObject([{ kind: 'before', minutes: 10 }])
  })

  test('aplicar dos veces la misma entrada no duplica nada', () => {
    const once = applyInbox(emptyState(), [entry({ places: [{ id: 'p1', name: 'Casa' }] })]).state
    expect(applyInbox(once, [entry({ places: [{ id: 'p1', name: 'Casa' }] })]).actions).toEqual([])
    expect(applyInbox(once, [entry()]).state).toBe(once)
  })

  test('un lugar creado mientras tanto en la app con el mismo nombre se reutiliza', () => {
    const { state } = applyInbox(withPlaces(place('app', 'Mercadona')), [
      entry({
        places: [{ id: 'fuera', name: 'mercadona' }],
        tasks: [{ id: 't1', title: 'Leche', date: null, time: null, reminders: [{ kind: 'place', placeId: 'fuera', on: 'arrive' }] }],
      }),
    ])
    expect(state.places.map((item) => item.id)).toEqual(['app'])
    expect(state.tasks[0]?.reminders).toMatchObject([{ kind: 'place', placeId: 'app', on: 'arrive' }])
  })

  test('un aviso de un lugar que ya no existe se descarta', () => {
    const { state } = applyInbox(emptyState(), [
      entry({ tasks: [{ id: 't1', title: 'Leche', date: null, time: null, reminders: [{ kind: 'place', placeId: 'borrado', on: 'arrive' }] }] }),
    ])
    expect(state.tasks[0]?.reminders).toEqual([])
  })

  test('varias entradas se aplican en orden y comparten los lugares que crean', () => {
    const { state } = applyInbox(emptyState(), [
      entry({ id: 'e1', places: [{ id: 'p1', name: 'Gimnasio' }], tasks: [] }),
      entry({
        id: 'e2',
        places: [{ id: 'p2', name: 'gimnasio' }],
        tasks: [{ id: 't2', title: 'Toalla', date: null, time: null, reminders: [{ kind: 'place', placeId: 'p2', on: 'leave' }] }],
      }),
    ])
    expect(state.places.map((item) => item.id)).toEqual(['p1'])
    expect(state.tasks[0]?.reminders).toMatchObject([{ kind: 'place', placeId: 'p1', on: 'leave' }])
  })

  test('no toca el estado de partida', () => {
    const start = emptyState()
    applyInbox(start, [entry()])
    expect(start.tasks).toEqual([])
  })

  test('devuelve las entradas tal como se aplicaron, las de solo texto ya interpretadas', () => {
    const { entries } = applyInbox(emptyState(), [entry({ id: 'texto', tasks: [], text: 'comprar pan' })])
    expect(entries).toEqual([{ id: 'texto', createdAt: NOW, places: [], tasks: [{ id: 'texto-1', title: 'Comprar pan', date: null, time: null, reminders: [] }] }])
  })
})

describe('resolveEntry: lo que el lado nativo no pudo interpretar', () => {
  const textEntry = (text: string) => entry({ id: 'x', tasks: [], text })

  test('se interpreta con la hora a la que se dijo, no con la de abrir la app', () => {
    const resolved = resolveEntry(textEntry('llamar a Ana mañana a las 17:00'), [])
    expect(resolved.tasks).toEqual([
      { id: 'x-1', title: 'Llamar a Ana', date: '2026-09-19', time: '17:00', reminders: [{ kind: 'before', minutes: 0 }] },
    ])
  })

  test('los ids salen del de la entrada: releerla no duplica', () => {
    const once = applyInbox(emptyState(), [textEntry('comprar pan')]).state
    expect(applyInbox(once, [textEntry('comprar pan')]).state).toBe(once)
  })

  test('un lugar nuevo también sale con id fijo', () => {
    const resolved = resolveEntry(textEntry('comprar leche al pasar por Mercadona'), [])
    expect(resolved.places).toEqual([{ id: 'x-1', name: 'Mercadona' }])
    expect(resolved.tasks[0]).toMatchObject({ id: 'x-2', reminders: [{ kind: 'place', placeId: 'x-1', on: 'arrive' }] })
  })

  test('sin nada que apuntar queda vacía', () => {
    expect(resolveEntry(textEntry('   '), []).tasks).toEqual([])
  })

  test('una entrada ya interpretada no se toca aunque traiga texto', () => {
    const interpreted = entry({ text: 'llamar a Ana' })
    expect(resolveEntry(interpreted, [])).toBe(interpreted)
  })
})

test('entryTaskIds', () => {
  expect(entryTaskIds(entry())).toEqual(['t1'])
})

