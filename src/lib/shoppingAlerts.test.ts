import { describe, expect, test } from 'vitest'
import { emptyState } from '../state/reducer'
import type { AppState, Place, ShoppingItem } from '../types'
import { toInstant } from './date'
import { parseNotificationEvent } from './nativeEvents'
import { nativePlan } from './nativeSchedule'
import { placeAlerts } from './places'

const TODAY = '2026-09-11'
const NOW = toInstant(TODAY, '10:00')

const mercadona: Place = { id: 'm', name: 'Mercadona', aliases: [], location: { lat: 39.47, lng: -0.38, address: '' }, radius: 150 }
const unlocated: Place = { id: 'x', name: 'Sin sitio', aliases: [], location: null, radius: 150 }

const item = (name: string, done = false): ShoppingItem => ({ id: name, name, qty: null, done, order: 0, createdAt: 0, doneAt: done ? 1 : null })

const stateWith = (placeId: string | null, items: ShoppingItem[]): AppState => ({
  ...emptyState(),
  places: [mercadona, unlocated],
  shopping: { items, history: [], placeId },
})

describe('la cesta al llegar a la tienda', () => {
  test('una región al llegar; el cuerpo no lleva la lista (cambiaría al tachar dentro de la tienda)', () => {
    const state = stateWith('m', [item('Pan'), item('Leche'), item('Huevos', true)])
    expect(placeAlerts(state, TODAY)).toEqual([
      {
        key: 'm:arrive',
        placeId: 'm',
        on: 'arrive',
        lat: 39.47,
        lng: -0.38,
        radius: 150,
        title: 'Mercadona',
        body: 'Lo que queda de la cesta',
        taskIds: [],
        shopping: true,
      },
    ])
    // Tachar algo no cambia lo registrado.
    const bought = stateWith('m', [item('Pan', true), item('Leche'), item('Huevos', true)])
    expect(placeAlerts(bought, TODAY)).toEqual(placeAlerts(state, TODAY))
  })

  test('si la tienda ya avisa al llegar por sus tareas, va en ese mismo aviso', () => {
    const state: AppState = {
      ...stateWith('m', [item('Pan'), item('Leche')]),
      tasks: [
        {
          id: 'pilas',
          title: 'Comprar pilas',
          done: false,
          date: TODAY,
          until: null,
          time: null,
          duration: null,
          reminders: [{ id: 'r', kind: 'place', placeId: 'm', on: 'arrive' }],
          sectionId: null,
          order: 0,
          importance: 1,
          createdAt: 0,
          completedAt: null,
        },
      ],
    }
    const alerts = placeAlerts(state, TODAY)
    expect(alerts).toHaveLength(1)
    expect(alerts[0]).toMatchObject({ key: 'm:arrive', body: 'Comprar pilas · y la cesta', taskIds: ['pilas'], shopping: true })
  })

  test('sin pendientes, sin tienda o con una sin ubicar, nada', () => {
    expect(placeAlerts(stateWith('m', [item('Pan', true)]), TODAY)).toEqual([])
    expect(placeAlerts(stateWith(null, [item('Pan')]), TODAY)).toEqual([])
    expect(placeAlerts(stateWith('x', [item('Pan')]), TODAY)).toEqual([])
    // Lo de antes de la cesta sigue valiendo tal cual.
    expect(placeAlerts({ tasks: [], places: [mercadona] }, TODAY)).toEqual([])
  })

  test('en el plan del iPhone va marcada y sin botones, y al tocarla se abre la cesta', () => {
    const [alert] = nativePlan(stateWith('m', [item('Pan')]), NOW).places
    expect(alert).toMatchObject({ on: 'arrive', extra: { placeId: 'm', on: 'arrive', taskIds: '', shopping: '1' } })
    expect(alert?.category).toBeUndefined()
    expect(parseNotificationEvent('tap', alert!.extra)).toEqual({ action: 'open', taskIds: [], placeId: 'm', shopping: true })
    // Un aviso de lugar de siempre no la abre.
    expect(parseNotificationEvent('tap', { placeId: 'm', on: 'arrive', taskIds: 'a' })).toEqual({ action: 'open', taskIds: ['a'], placeId: 'm' })
  })
})
