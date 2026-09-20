import { describe, expect, test } from 'vitest'
import type { AppState, Section, Task } from '../types'
import { emptyState } from '../state/reducer'
import { addDays, toInstant } from './date'
import { WIDGET_DAYS, WIDGET_MAX_TASKS, widgetSnapshot, widgetToggles } from './widget'

const TODAY = '2026-09-16'
const NOW = toInstant(TODAY, '10:00')

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

const section = (id: string, order: number): Section => ({ id, name: id, order, collapsed: false })

const stateWith = (tasks: Task[], sections: Section[] = []): AppState => ({ ...emptyState(), tasks, sections })

const ids = (state: AppState) => widgetSnapshot(state, NOW).tasks.map((item) => item.id)

describe('widgetSnapshot', () => {
  test('lleva solo lo que el widget puede enseñar', () => {
    const snapshot = widgetSnapshot(
      stateWith([task({ id: 'hoy', title: 'Comprar pan', time: '17:00', importance: 4, reminders: [{ id: 'r', kind: 'before', minutes: 10 }] })]),
      NOW,
    )
    expect(snapshot).toEqual({
      version: 1,
      tasks: [{ id: 'hoy', title: 'Comprar pan', date: TODAY, time: '17:00', done: false, importance: 4 }],
    })
  })

  test('lo atrasado pendiente entra; lo atrasado hecho y lo sin fecha, no', () => {
    const state = stateWith([
      task({ id: 'atrasada', date: '2026-09-10' }),
      task({ id: 'hecha-ayer', date: '2026-09-15', done: true }),
      task({ id: 'sin-fecha', date: null }),
      task({ id: 'hecha-hoy', done: true }),
    ])
    expect(ids(state)).toEqual(['atrasada', 'hecha-hoy'])
  })

  test('incluye los próximos días para que el widget cambie de día sin abrir la app', () => {
    const state = stateWith([
      task({ id: 'ultimo', date: addDays(TODAY, WIDGET_DAYS) }),
      task({ id: 'fuera', date: addDays(TODAY, WIDGET_DAYS + 1) }),
      task({ id: 'manana', date: addDays(TODAY, 1), done: true }),
    ])
    expect(ids(state)).toEqual(['manana', 'ultimo'])
  })

  test('ordena por día y, dentro del día, como la pantalla principal: raíz y después secciones', () => {
    const state = stateWith(
      [
        task({ id: 'casa-1', sectionId: 'casa', order: 1 }),
        task({ id: 'trabajo-0', sectionId: 'trabajo', order: 0 }),
        task({ id: 'raiz-1', order: 1 }),
        task({ id: 'raiz-0', order: 0 }),
        task({ id: 'casa-0', sectionId: 'casa', order: 0 }),
        task({ id: 'manana', date: addDays(TODAY, 1) }),
      ],
      [section('trabajo', 1), section('casa', 0)],
    )
    expect(ids(state)).toEqual(['raiz-0', 'raiz-1', 'casa-0', 'casa-1', 'trabajo-0', 'manana'])
  })

  test('lo atrasado va por fecha y orden, sin mirar la sección, como el bloque Atrasadas', () => {
    const state = stateWith(
      [
        task({ id: 'b', date: '2026-09-14', sectionId: 'casa', order: 0 }),
        task({ id: 'a', date: '2026-09-14', order: 1 }),
        task({ id: 'antigua', date: '2026-09-01', order: 5 }),
      ],
      [section('casa', 0)],
    )
    expect(ids(state)).toEqual(['antigua', 'b', 'a'])
  })

  test('recorta por el final: lo lejano sobra antes que lo de hoy', () => {
    const many = Array.from({ length: WIDGET_MAX_TASKS }, (_, index) => task({ id: `lejos-${index}`, date: addDays(TODAY, 3), order: index }))
    const state = stateWith([...many, task({ id: 'hoy' })])
    const result = ids(state)
    expect(result).toHaveLength(WIDGET_MAX_TASKS)
    expect(result[0]).toBe('hoy')
  })

  test('no depende de la hora del día: misma foto en todo el día', () => {
    const state = stateWith([task({ id: 'a' })])
    expect(widgetSnapshot(state, toInstant(TODAY, '00:01'))).toEqual(widgetSnapshot(state, toInstant(TODAY, '23:59')))
  })
})

describe('widgetToggles', () => {
  const tasks = [task({ id: 'pendiente' }), task({ id: 'hecha', done: true })]

  test('alterna solo lo que el widget dejó distinto', () => {
    expect(
      widgetToggles(tasks, [
        { taskId: 'pendiente', done: true },
        { taskId: 'hecha', done: true },
      ]),
    ).toEqual(['pendiente'])
  })

  test('desmarcar desde el widget también cuenta', () => {
    expect(widgetToggles(tasks, [{ taskId: 'hecha', done: false }])).toEqual(['hecha'])
  })

  test('ignora tareas borradas desde entonces', () => {
    expect(widgetToggles(tasks, [{ taskId: 'borrada', done: true }])).toEqual([])
  })

  test('con la misma tarea repetida manda la última', () => {
    expect(
      widgetToggles(tasks, [
        { taskId: 'pendiente', done: true },
        { taskId: 'pendiente', done: false },
      ]),
    ).toEqual([])
  })
})
