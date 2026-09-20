import { describe, expect, test } from 'vitest'
import { emptyState } from '../state/reducer'
import type { AppState, Task } from '../types'
import { addDays, toInstant } from './date'
import { addFromText, moveOverdue, voiceContext } from './headless'
import type { HeadlessInput } from './headless'
import type { InboxEntry } from './inbox'

const TODAY = '2026-09-18'
const NOW = toInstant(TODAY, '10:00')

function sequence() {
  let count = 0
  return () => `id-${++count}`
}

const task = (partial: Partial<Task> & { id: string }): Task => ({
  title: partial.id,
  done: false,
  date: TODAY,
  time: null,
  duration: null,
  reminders: [],
  sectionId: null,
  order: 0,
  createdAt: 0,
  importance: 1,
  completedAt: null,
  ...partial,
})

const saved = (tasks: Task[] = []): AppState => ({ ...emptyState(), tasks })

const input = (partial: Partial<HeadlessInput> = {}): HeadlessInput => ({
  now: NOW,
  text: '',
  interpreted: null,
  // El fichero de estado es el JSON del estado tal cual.
  state: JSON.parse(JSON.stringify(saved())),
  inbox: [],
  widgetChanges: [],
  ...partial,
})

const run = (partial: Partial<HeadlessInput> = {}) => addFromText(input(partial), sequence())

test('voiceContext: día y hora locales, como los manda la app al dictar', () => {
  expect(voiceContext(NOW)).toEqual({ today: TODAY, now: '10:00' })
})

describe('addFromText', () => {
  test('usa lo que entendió la IA del servidor', () => {
    const result = run({
      text: 'bueno, hoy tengo una cena a las 20:00, recuérdamelo media hora antes',
      interpreted: [{ title: 'Cena', date: TODAY, time: '20:00', duration: null, reminders: [{ kind: 'before', minutes: 30 }] }],
    })
    expect(result.entry?.tasks).toEqual([
      { id: 'id-1', title: 'Cena', date: TODAY, time: '20:00', duration: null, reminders: [{ kind: 'before', minutes: 30 }] },
    ])
    // Comas y no "·": Siri lo lee en voz alta.
    expect(result.message).toBe('Apuntada: Cena, hoy 20:00, 30 min antes.')
  })

  test('sin IA, el analizador local del móvil', () => {
    const result = run({ text: 'Llamar a Miguel mañana a las 17:00' })
    expect(result.entry?.tasks).toEqual([
      { id: 'id-1', title: 'Llamar a Miguel', date: addDays(TODAY, 1), time: '17:00', duration: null, reminders: [{ kind: 'before', minutes: 0 }] },
    ])
    expect(result.message).toBe('Apuntada: Llamar a Miguel, mañana 17:00.')
  })

  test('sin fecha lo dice, para que se sepa dónde ha ido', () => {
    expect(run({ text: 'comprar pan' }).message).toBe('Apuntada: Comprar pan, sin fecha.')
  })

  test('varias tareas a la vez', () => {
    const result = run({
      text: 'comprar pan y llamar a Ana',
      interpreted: [
        { title: 'Comprar pan', date: null, time: null, duration: null, reminders: [] },
        { title: 'Llamar a Ana', date: null, time: null, duration: null, reminders: [] },
      ],
    })
    expect(result.entry?.tasks.map((item) => item.title)).toEqual(['Comprar pan', 'Llamar a Ana'])
    expect(result.message).toBe('Apuntadas 2 tareas: Comprar pan, Llamar a Ana.')
  })

  test('un lugar sin guardar se crea sin ubicación y se avisa de que falta', () => {
    const result = run({ text: 'comprar leche al pasar por Mercadona' })
    expect(result.entry?.places).toEqual([{ id: 'id-1', name: 'Mercadona' }])
    expect(result.message).toBe('Apuntada: Comprar leche, al llegar a Mercadona. Abre Tasks para decir dónde está Mercadona.')
  })

  test('si no se entiende nada, no apunta ni toca los avisos', () => {
    const result = run({ text: '  ' })
    expect(result).toEqual({ entry: null, message: 'No te he entendido.', plan: null, badge: null, widget: null })
  })

  test('el plan, el número del icono y el widget cuentan ya con la tarea nueva', () => {
    const result = run({
      interpreted: [{ title: 'Dentista', date: TODAY, time: '17:00', duration: null, reminders: [{ kind: 'before', minutes: 15 }] }],
      text: 'dentista a las 5',
    })
    expect(result.plan?.timed).toMatchObject([{ at: toInstant(TODAY, '16:45'), title: 'Dentista', extra: { taskId: 'id-1' } }])
    expect(result.badge).toBe(1)
    expect(result.widget?.tasks).toEqual([{ id: 'id-1', title: 'Dentista', date: TODAY, time: '17:00', done: false, importance: 1 }])
  })

  test('lo apuntado antes sin aplicar y lo marcado en el widget también cuentan', () => {
    const pending: InboxEntry = {
      id: 'e0',
      createdAt: NOW - 1000,
      places: [],
      tasks: [{ id: 'antes', title: 'Antes', date: TODAY, time: '18:00', duration: null, reminders: [{ kind: 'before', minutes: 0 }] }],
    }
    const result = run({
      text: 'comprar pan hoy',
      state: JSON.parse(JSON.stringify(saved([task({ id: 'hecha-en-widget', time: '19:00', duration: null, reminders: [{ id: 'r', kind: 'before', minutes: 0 }] })]))),
      inbox: [pending],
      widgetChanges: [{ taskId: 'hecha-en-widget', done: true }],
    })
    expect(result.plan?.timed.map((item) => item.extra.taskId)).toEqual(['antes'])
    // Antes y Comprar pan: la marcada en el widget ya no cuenta.
    expect(result.badge).toBe(2)
    expect(result.widget?.tasks.map((item) => item.id).sort()).toEqual(['antes', 'hecha-en-widget', 'id-1'])
  })

  test('sin fichero de estado apunta, pero no toca avisos, icono ni widget: no sabe qué hay', () => {
    const result = run({ text: 'comprar pan', state: null })
    expect(result.entry?.tasks).toHaveLength(1)
    expect(result.plan).toBeNull()
    expect(result.badge).toBeNull()
    expect(result.widget).toBeNull()
  })
})

describe('moveOverdue', () => {
  const YESTERDAY = addDays(TODAY, -1)
  const move = (partial: Partial<HeadlessInput> = {}) => moveOverdue(input(partial), sequence())
  const stateOf = (tasks: Task[]) => JSON.parse(JSON.stringify(saved(tasks)))

  test('apunta en la bandeja lo atrasado, de lo más antiguo a lo más reciente', () => {
    const result = move({
      state: stateOf([
        task({ id: 'ayer', date: YESTERDAY }),
        task({ id: 'antigua', date: addDays(TODAY, -5) }),
        task({ id: 'hecha', date: YESTERDAY, done: true }),
        task({ id: 'hoy' }),
      ]),
    })
    expect(result.entry).toEqual({ id: 'id-1', createdAt: NOW, places: [], tasks: [], move: { date: TODAY, taskIds: ['antigua', 'ayer'] } })
    // Solo cuántas: se oye y se ve también con el iPhone bloqueado.
    expect(result.message).toBe('2 tareas pasadas a hoy.')
  })

  test('el widget y los avisos ya las tienen en hoy; el número del icono no cambia', () => {
    const result = move({
      state: stateOf([task({ id: 'llamar', date: YESTERDAY, time: '17:00', duration: null, reminders: [{ id: 'r', kind: 'before', minutes: 15 }] })]),
    })
    expect(result.message).toBe('1 tarea pasada a hoy.')
    expect(result.widget?.tasks).toMatchObject([{ id: 'llamar', date: TODAY }])
    expect(result.plan?.timed).toMatchObject([{ at: toInstant(TODAY, '16:45'), extra: { taskId: 'llamar' } }])
    expect(result.badge).toBe(1)
  })

  test('lo marcado en el widget ya no está atrasado', () => {
    const result = move({
      state: stateOf([task({ id: 'a', date: YESTERDAY }), task({ id: 'b', date: YESTERDAY })]),
      widgetChanges: [{ taskId: 'a', done: true }],
    })
    expect(result.entry?.move?.taskIds).toEqual(['b'])
  })

  test('sin nada atrasado, o sin fichero de estado, no apunta nada', () => {
    expect(move({ state: stateOf([task({ id: 'hoy' })])})).toEqual({
      entry: null,
      message: 'No hay nada atrasado.',
      plan: null,
      badge: null,
      widget: null,
    })
    expect(move({ state: null })).toMatchObject({ entry: null, message: 'Abre Tasks para ver lo atrasado.', plan: null })
  })
})
