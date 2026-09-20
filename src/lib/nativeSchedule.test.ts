import { describe, expect, test } from 'vitest'
import type { AppState, Place, Task } from '../types'
import { toInstant } from './date'
import { MAX_PENDING, PLACE_ID_BASE, isPlaceNotification, nativePlan, numericId, planFingerprint } from './nativeSchedule'
import { emptyState } from '../state/reducer'

const TODAY = '2026-09-11'
const NOW = toInstant(TODAY, '10:00')
const MINUTE = 60_000

const task = (partial: Partial<Task> & { id: string }): Task => ({
  title: partial.id,
  done: false,
  date: TODAY,
  time: null,
  reminders: [],
  sectionId: null,
  order: 0,
  createdAt: 0,
  importance: 1,
  completedAt: null,
  ...partial,
})

const mercadona: Place = { id: 'm', name: 'Mercadona', location: { lat: 39.47, lng: -0.38, address: '' }, radius: 150 }

const stateWith = (tasks: Task[], places: Place[] = []): AppState => ({ ...emptyState(), tasks, places })

describe('numericId', () => {
  test('es estable para la misma clave y cae dentro del rango', () => {
    const taken = new Set<number>()
    const id = numericId('recordatorio-1', 1, 1000, taken)
    expect(numericId('recordatorio-1', 1, 1000, new Set())).toBe(id)
    expect(id).toBeGreaterThanOrEqual(1)
    expect(id).toBeLessThan(1001)
  })

  test('si choca con uno ya usado, busca el siguiente libre', () => {
    const first = numericId('a', 1, 10, new Set())
    const second = numericId('a', 1, 10, new Set([first]))
    expect(second).not.toBe(first)
  })
})

describe('nativePlan', () => {
  test('convierte los avisos por hora en notificaciones con id numérico y la tarea en extra', () => {
    const at = NOW + 30 * MINUTE
    const plan = nativePlan(stateWith([task({ id: 'pan', title: 'Comprar pan', reminders: [{ id: 'r1', kind: 'at', at }] })]), NOW)
    expect(plan.places).toEqual([])
    expect(plan.timed).toHaveLength(1)
    const [notification] = plan.timed
    expect(notification).toMatchObject({ at, title: 'Comprar pan', extra: { taskId: 'pan', entryId: 'r1' }, category: 'task' })
    expect(notification!.id).toBeGreaterThan(0)
    expect(notification!.id).toBeLessThan(PLACE_ID_BASE)
    expect(isPlaceNotification(notification!.id)).toBe(false)
  })

  test('el resumen diario no lleva botones de tarea', () => {
    const state = { ...stateWith([task({ id: 'a', date: '2026-09-12' })]), settings: { digest: { enabled: true, time: '08:30' } } }
    const [digest] = nativePlan(state, NOW).timed
    expect(digest).toMatchObject({ extra: { taskId: '', entryId: 'digest-20260912' } })
    expect(digest!.category).toBeUndefined()
  })

  test('con algo atrasado, el resumen ofrece pasarlo a hoy', () => {
    const state = { ...stateWith([task({ id: 'a' })]), settings: { digest: { enabled: true, time: '08:30' } } }
    const [digest] = nativePlan(state, NOW).timed
    expect(digest).toMatchObject({ extra: { entryId: 'digest-20260912' }, category: 'digest-overdue' })
  })

  test('el aviso de una tarea que ya quedó atrás lleva también "Pasar a hoy"', () => {
    const at = toInstant('2026-09-12', '09:00')
    const [notification] = nativePlan(stateWith([task({ id: 'a', reminders: [{ id: 'r', kind: 'at', at }] })]), NOW).timed
    expect(notification!.category).toBe('task-overdue')
  })

  test('los avisos de lugar usan su propio rango de ids y llevan las tareas', () => {
    const tasks = [
      task({ id: 'pan', date: null, reminders: [{ id: 'r1', kind: 'place', placeId: 'm', on: 'arrive' }] }),
      task({ id: 'leche', date: null, reminders: [{ id: 'r2', kind: 'place', placeId: 'm', on: 'arrive' }] }),
    ]
    const [alert] = nativePlan(stateWith(tasks, [mercadona]), NOW).places
    expect(alert).toMatchObject({
      lat: 39.47,
      lng: -0.38,
      radius: 150,
      on: 'arrive',
      title: 'Mercadona',
      body: 'pan · leche',
      extra: { placeId: 'm', on: 'arrive', taskIds: 'pan,leche' },
    })
    expect(isPlaceNotification(alert!.id)).toBe(true)
    // Con varias tareas los botones "Hecha" no sabrían cuál marcar.
    expect(alert!.category).toBeUndefined()
  })

  test('las regiones restan del máximo de iOS: nunca más de 64 pendientes en total', () => {
    const timed = Array.from({ length: 80 }, (_, index) =>
      task({ id: `t${index}`, reminders: [{ id: `r${index}`, kind: 'at', at: NOW + (index + 1) * MINUTE }] }),
    )
    const placed = task({ id: 'p', date: null, reminders: [{ id: 'rp', kind: 'place', placeId: 'm', on: 'arrive' }] })
    const plan = nativePlan(stateWith([...timed, placed], [mercadona]), NOW)
    expect(plan.places).toHaveLength(1)
    expect(plan.timed).toHaveLength(MAX_PENDING - 1)
    // Se quedan los más próximos.
    expect(plan.timed.at(-1)?.at).toBe(NOW + (MAX_PENDING - 1) * MINUTE)
  })

  test('los ids no se repiten dentro del plan', () => {
    const tasks = Array.from({ length: 60 }, (_, index) =>
      task({ id: `t${index}`, reminders: [{ id: `r${index}`, kind: 'at', at: NOW + (index + 1) * MINUTE }] }),
    )
    const ids = nativePlan(stateWith(tasks), NOW).timed.map((notification) => notification.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
})

describe('planFingerprint', () => {
  test('cambia solo si cambia lo que se programa', () => {
    const state = stateWith([task({ id: 'a', reminders: [{ id: 'r', kind: 'at', at: NOW + MINUTE }] })])
    const plan = nativePlan(state, NOW)
    expect(planFingerprint(nativePlan(state, NOW))).toBe(planFingerprint(plan))
    const renamed = stateWith([task({ id: 'a', title: 'otro', reminders: [{ id: 'r', kind: 'at', at: NOW + MINUTE }] })])
    expect(planFingerprint(nativePlan(renamed, NOW))).not.toBe(planFingerprint(plan))
  })
})
