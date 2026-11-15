import { describe, expect, it } from 'vitest'
import { emptyState, reducer } from '../../state/reducer'
import type { Action } from '../../state/actions'
import type { AppState, SharedBasket } from '../../types'
import { PERSONAL, applySync, basketRecords, personalRecords } from './records'
import type { SyncChange } from './records'

const run = (actions: Action[], start: AppState = emptyState()) => actions.reduce(reducer, start)

const link = { room: 'r'.repeat(22), key: 'k'.repeat(43), member: 'member1', token: 't'.repeat(43), owner: true }
const basket: SharedBasket = { id: link.room, name: 'Piso', items: [], history: [], placeId: null, order: 0, link }

/** Todo el estado como cambios, como si llegara entero de la sala. */
const asChanges = (records: Map<string, unknown>): SyncChange[] =>
  [...records].map(([key, value]) => ({ key, value: JSON.parse(JSON.stringify(value)) }))

describe('personalRecords y applySync', () => {
  const full = run([
    { type: 'section/add', id: 's1', name: 'Casa' },
    { type: 'task/add', id: 't1', title: 'Pan', date: '2026-11-14', sectionId: 's1', time: '10:00' },
    { type: 'place/add', id: 'p1', name: 'Mercadona' },
    { type: 'routine/add', id: 'r1', title: 'Creatina', days: [1, 2], time: null },
    { type: 'shopping/add', id: 'i1', name: 'leche', now: 5 },
    { type: 'shopping/toggle', id: 'i1', now: 6 },
    { type: 'settings/theme', theme: 'dark' },
    { type: 'basket/add', basket },
  ])

  it('lo que sale de un estado reconstruye el mismo estado en otro', () => {
    const copy = applySync(emptyState(), PERSONAL, asChanges(personalRecords(full)))
    expect(personalRecords(copy)).toEqual(personalRecords(full))
    expect(copy.tasks[0]!).toEqual(full.tasks[0])
    expect(copy.settings.theme).toBe('dark')
    expect(copy.baskets[0]!.link).toEqual(link)
  })

  it('no lleva lo que es de cada dispositivo', () => {
    const keys = [...personalRecords(full).keys()]
    const settings = personalRecords(full).get('g:settings')!
    expect(keys.some((key) => key.includes('calendar'))).toBe(false)
    expect(Object.keys(settings)).not.toContain('dictation')
    expect(Object.keys(settings)).not.toContain('stats')
  })

  it('un registro nulo borra', () => {
    const next = applySync(full, PERSONAL, [{ key: 't:t1', value: null }])
    expect(next.tasks).toEqual([])
  })

  it('el mismo objeto da el mismo registro (se compara por referencia)', () => {
    expect(personalRecords(full).get('t:t1')).toBe(personalRecords(full).get('t:t1'))
  })

  it('una tarea cuya sección aún no ha llegado la conserva', () => {
    const value = personalRecords(full).get('t:t1')!
    const next = applySync(emptyState(), PERSONAL, [{ key: 't:t1', value }])
    expect(next.tasks[0]!.sectionId).toBe('s1')
  })

  it('ignora lo que no entiende', () => {
    expect(applySync(full, PERSONAL, [{ key: 'z:1', value: { a: 1 } }])).toEqual(full)
    expect(applySync(full, PERSONAL, [{ key: 't:x', value: { nope: true } }]).tasks).toHaveLength(1)
  })
})

describe('cestas compartidas', () => {
  it('sus cosas van a su sala y vuelven', () => {
    const mine = run([
      { type: 'basket/add', basket },
      { type: 'shopping/add', id: 'i1', name: 'huevos', now: 1, basket: link.room },
    ])
    const records = basketRecords(mine.baskets[0]!)
    expect([...records.keys()].sort()).toEqual(['g:meta', 'i:i1'])
    const other = run([{ type: 'basket/add', basket: { ...basket, name: '…' } }])
    const next = applySync(other, link.room, asChanges(records))
    expect(next.baskets[0]!.items.map((item) => item.name)).toEqual(['Huevos'])
    expect(next.baskets[0]!.name).toBe('Piso')
  })

  it('el nombre provisional de quien acaba de entrar no se sube', () => {
    const state = run([{ type: 'basket/add', basket: { ...basket, name: '…' } }])
    expect(basketRecords(state.baskets[0]!).has('g:meta')).toBe(false)
  })

  it('no mezcla la cesta propia con la compartida', () => {
    const state = run([
      { type: 'basket/add', basket },
      { type: 'shopping/add', name: 'pan', now: 1 },
      { type: 'shopping/add', name: 'leche', now: 1, basket: link.room },
    ])
    expect(state.shopping.items.map((item) => item.name)).toEqual(['Pan'])
    expect(state.baskets[0]!.items.map((item) => item.name)).toEqual(['Leche'])
  })

  it('una cesta que deja de estar en tu grupo desaparece', () => {
    const state = run([{ type: 'basket/add', basket }])
    expect(applySync(state, PERSONAL, [{ key: `b:${link.room}`, value: null }]).baskets).toEqual([])
  })

  it('las copias exportadas no llevan las cestas compartidas', async () => {
    const { serializeBackup } = await import('../backup')
    const state = run([{ type: 'basket/add', basket }])
    expect(JSON.parse(serializeBackup(state)).state.baskets).toEqual([])
  })

  it('importar una copia conserva las cestas compartidas', () => {
    const state = run([{ type: 'basket/add', basket }])
    expect(reducer(state, { type: 'state/import', state: emptyState() }).baskets).toHaveLength(1)
  })

  it('vincularse a un grupo conserva las cestas compartidas', () => {
    const state = run([{ type: 'basket/add', basket }, { type: 'task/add', title: 'Pan', date: null, sectionId: null }])
    const adopted = reducer(state, { type: 'sync/adopt' })
    expect(adopted.tasks).toEqual([])
    expect(adopted.baskets).toHaveLength(1)
  })

  it('el traspaso de dueño se refleja en la cesta', () => {
    const state = run([{ type: 'basket/add', basket: { ...basket, link: { ...link, owner: false } } }])
    expect(reducer(state, { type: 'basket/owner', id: link.room, owner: true }).baskets[0]!.link.owner).toBe(true)
  })

  it('deshacer el borrado de un lugar devuelve su aviso a las cestas compartidas', () => {
    const state = run([
      { type: 'place/add', id: 'p1', name: 'Mercadona' },
      { type: 'basket/add', basket },
      { type: 'shopping/place', placeId: 'p1', basket: link.room },
    ])
    const place = state.places[0]!
    const removed = reducer(state, { type: 'place/remove', id: 'p1' })
    expect(removed.baskets[0]!.placeId).toBeNull()
    const back = reducer(removed, { type: 'place/restore', place, reminders: [], baskets: [link.room] })
    expect(back.baskets[0]!.placeId).toBe('p1')
  })

  it('lo que llega a una cesta no pasa del tope', () => {
    const state = run([{ type: 'basket/add', basket }])
    const changes = Array.from({ length: 450 }, (_, i) => ({ key: `i:x${i}`, value: { name: `Cosa ${i}`, qty: null, done: false, order: i, createdAt: 1, doneAt: null } }))
    expect(applySync(state, link.room, changes).baskets[0]!.items).toHaveLength(400)
  })
})
