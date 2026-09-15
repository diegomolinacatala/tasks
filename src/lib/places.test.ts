import { describe, expect, test } from 'vitest'
import type { Place, Reminder, Task } from '../types'
import {
  DEFAULT_RADIUS,
  MAX_PLACE_ALERTS,
  MAX_RADIUS,
  MIN_RADIUS,
  findPlace,
  normalizePlace,
  placeAlerts,
  placeKey,
  placeReminderLabel,
} from './places'

const TODAY = '2026-09-11'

const place = (partial: Partial<Place> & { id: string }): Place => ({
  name: partial.id,
  location: { lat: 39.47, lng: -0.38, address: 'Calle Colón 1, Valencia' },
  radius: DEFAULT_RADIUS,
  ...partial,
})

const atPlace = (placeId: string, on: 'arrive' | 'leave' = 'arrive', id = `r-${placeId}-${on}`): Reminder => ({
  id,
  kind: 'place',
  placeId,
  on,
})

const task = (partial: Partial<Task> & { id: string }): Task => ({
  title: partial.id,
  done: false,
  date: null,
  time: null,
  reminders: [],
  sectionId: null,
  order: 0,
  createdAt: 0,
  completedAt: null,
  ...partial,
})

describe('placeKey', () => {
  test('compara sin tildes, mayúsculas, espacios de más ni artículo', () => {
    expect(placeKey('  La   Universidad ')).toBe('universidad')
    expect(placeKey('Mi Gimnasio')).toBe('gimnasio')
    expect(placeKey('Dentista Pérez')).toBe('dentista perez')
  })
})

describe('findPlace', () => {
  const places = [place({ id: 'm', name: 'Mercadona' }), place({ id: 'u', name: 'Universidad' })]

  test('encuentra por nombre aunque cambien tildes, mayúsculas o el artículo', () => {
    expect(findPlace(places, 'mercadona')?.id).toBe('m')
    expect(findPlace(places, 'la universidad')?.id).toBe('u')
  })

  test('devuelve null si no hay ninguno con ese nombre', () => {
    expect(findPlace(places, 'Lidl')).toBeNull()
    expect(findPlace(places, '   ')).toBeNull()
  })
})

describe('placeReminderLabel', () => {
  const places = [place({ id: 'm', name: 'Mercadona' })]

  test('dice al llegar o al salir con el nombre del lugar', () => {
    expect(placeReminderLabel({ kind: 'place', placeId: 'm', on: 'arrive' }, places)).toBe('Al llegar a Mercadona')
    expect(placeReminderLabel({ kind: 'place', placeId: 'm', on: 'leave' }, places)).toBe('Al salir de Mercadona')
  })

  test('si el lugar ya no existe, lo dice sin nombre', () => {
    expect(placeReminderLabel({ kind: 'place', placeId: 'x', on: 'arrive' }, places)).toBe('Al llegar a un lugar')
  })
})

describe('normalizePlace', () => {
  test('acepta un lugar completo', () => {
    const raw = { id: 'm', name: ' Mercadona ', location: { lat: 39.5, lng: -0.4, address: 'Calle' }, radius: 300 }
    expect(normalizePlace(raw)).toEqual({ id: 'm', name: 'Mercadona', location: { lat: 39.5, lng: -0.4, address: 'Calle' }, radius: 300 })
  })

  test('sin ubicación válida queda pendiente de elegir dónde está', () => {
    expect(normalizePlace({ id: 'm', name: 'Mercadona', location: { lat: 200, lng: 0 } })?.location).toBeNull()
    expect(normalizePlace({ id: 'm', name: 'Mercadona' })?.location).toBeNull()
  })

  test('ajusta el radio a los límites y usa el de por defecto si falta', () => {
    expect(normalizePlace({ id: 'a', name: 'A', radius: 5 })?.radius).toBe(MIN_RADIUS)
    expect(normalizePlace({ id: 'a', name: 'A', radius: 99_999 })?.radius).toBe(MAX_RADIUS)
    expect(normalizePlace({ id: 'a', name: 'A' })?.radius).toBe(DEFAULT_RADIUS)
  })

  test('descarta lo que no tiene id o nombre', () => {
    expect(normalizePlace({ id: '', name: 'A' })).toBeNull()
    expect(normalizePlace({ id: 'a', name: '  ' })).toBeNull()
    expect(normalizePlace(null)).toBeNull()
  })
})

describe('placeAlerts', () => {
  const mercadona = place({ id: 'm', name: 'Mercadona' })
  const uni = place({ id: 'u', name: 'Universidad' })

  test('agrupa en un aviso por lugar las tareas pendientes', () => {
    const tasks = [
      task({ id: 'pan', title: 'Comprar pan', reminders: [atPlace('m', 'arrive', 'r1')] }),
      task({ id: 'leche', title: 'Leche', reminders: [atPlace('m', 'arrive', 'r2')] }),
    ]
    const [alert, ...rest] = placeAlerts({ tasks, places: [mercadona] }, TODAY)
    expect(rest).toHaveLength(0)
    expect(alert).toMatchObject({
      key: 'm:arrive',
      placeId: 'm',
      on: 'arrive',
      lat: 39.47,
      lng: -0.38,
      radius: DEFAULT_RADIUS,
      title: 'Mercadona',
      body: 'Comprar pan · Leche',
      taskIds: ['pan', 'leche'],
    })
  })

  test('llegar y salir del mismo sitio son avisos distintos', () => {
    const tasks = [
      task({ id: 'a', reminders: [atPlace('u', 'arrive')] }),
      task({ id: 'b', title: 'Apagar el móvil', reminders: [atPlace('u', 'leave')] }),
    ]
    const alerts = placeAlerts({ tasks, places: [uni] }, TODAY)
    expect(alerts.map((alert) => alert.key).sort()).toEqual(['u:arrive', 'u:leave'])
    expect(alerts.find((alert) => alert.on === 'leave')?.title).toBe('Al salir de Universidad')
  })

  test('ignora tareas hechas, de días futuros y lugares sin ubicación', () => {
    const noLocation = place({ id: 'x', name: 'Sin sitio', location: null })
    const tasks = [
      task({ id: 'hecha', done: true, reminders: [atPlace('m')] }),
      task({ id: 'futura', date: '2026-09-12', reminders: [atPlace('m')] }),
      task({ id: 'sin-sitio', reminders: [atPlace('x')] }),
      task({ id: 'atrasada', date: '2026-09-10', reminders: [atPlace('u')] }),
    ]
    const alerts = placeAlerts({ tasks, places: [mercadona, uni, noLocation] }, TODAY)
    expect(alerts.map((alert) => alert.taskIds)).toEqual([['atrasada']])
  })

  test('resume el cuerpo cuando hay muchas tareas', () => {
    const tasks = ['uno', 'dos', 'tres', 'cuatro', 'cinco'].map((id, order) =>
      task({ id, order, createdAt: order, reminders: [atPlace('m', 'arrive', `r-${id}`)] }),
    )
    expect(placeAlerts({ tasks, places: [mercadona] }, TODAY)[0]?.body).toBe('uno · dos · tres · +2')
  })

  test('no pasa del máximo de regiones y prioriza lo que es para hoy o está atrasado', () => {
    const places = Array.from({ length: MAX_PLACE_ALERTS + 5 }, (_, index) => place({ id: `p${index}`, name: `Lugar ${index}` }))
    const tasks = places.map((item, index) =>
      task({ id: `t${index}`, date: index === MAX_PLACE_ALERTS + 4 ? TODAY : null, reminders: [atPlace(item.id)] }),
    )
    const alerts = placeAlerts({ tasks, places }, TODAY)
    expect(alerts).toHaveLength(MAX_PLACE_ALERTS)
    expect(alerts[0]?.placeId).toBe(`p${MAX_PLACE_ALERTS + 4}`)
  })
})
