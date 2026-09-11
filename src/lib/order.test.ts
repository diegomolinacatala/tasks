import { describe, expect, test } from 'vitest'
import type { Task } from '../types'
import { applyOrder, byDisplay, inScope, moveTask, nextOrder, scopeKey, scopeOf } from './order'

const task = (partial: Partial<Task> & { id: string }): Task => ({
  title: partial.id,
  done: false,
  date: '2026-09-11',
  sectionId: null,
  order: 0,
  createdAt: 0,
  completedAt: null,
  ...partial,
})

const ids = (tasks: Task[]) => inScope(tasks, scopeOf(tasks[0]!)).map((t) => t.id)

describe('scopeKey', () => {
  test('separa por día y sección', () => {
    expect(scopeKey('2026-09-11', 'work')).toBe('2026-09-11::work')
    expect(scopeKey('2026-09-11', null)).toBe('2026-09-11::root')
  })

  test('todas las tareas sin fecha comparten un único scope plano', () => {
    expect(scopeKey(null, 'work')).toBe('backlog')
    expect(scopeKey(null, null)).toBe('backlog')
  })
})

describe('nextOrder', () => {
  test('devuelve 0 en un scope vacío', () => {
    expect(nextOrder([], '2026-09-11::root')).toBe(0)
  })

  test('coloca la nueva tarea al final', () => {
    const tasks = [task({ id: 'a', order: 0 }), task({ id: 'b', order: 4 })]
    expect(nextOrder(tasks, '2026-09-11::root')).toBe(5)
  })
})

describe('applyOrder', () => {
  test('reordena solo el scope indicado', () => {
    const tasks = [
      task({ id: 'a', order: 0 }),
      task({ id: 'b', order: 1 }),
      task({ id: 'c', order: 0, date: '2026-09-12' }),
    ]
    const result = applyOrder(tasks, '2026-09-11::root', ['b', 'a'])
    expect(ids(result)).toEqual(['b', 'a'])
    expect(result.find((t) => t.id === 'c')!.order).toBe(0)
  })

  test('las tareas no mencionadas quedan al final conservando su orden', () => {
    const tasks = [task({ id: 'a', order: 0 }), task({ id: 'b', order: 1 }), task({ id: 'c', order: 2 })]
    expect(ids(applyOrder(tasks, '2026-09-11::root', ['c']))).toEqual(['c', 'a', 'b'])
  })

  test('no muta el array original', () => {
    const tasks = [task({ id: 'a', order: 0 }), task({ id: 'b', order: 1 })]
    applyOrder(tasks, '2026-09-11::root', ['b', 'a'])
    expect(tasks.map((t) => t.order)).toEqual([0, 1])
  })
})

describe('moveTask', () => {
  test('inserta en la posición pedida del día destino', () => {
    const tasks = [
      task({ id: 'a', date: '2026-09-12', order: 0 }),
      task({ id: 'b', date: '2026-09-12', order: 1 }),
      task({ id: 'move', date: '2026-09-11', order: 0 }),
    ]
    const result = moveTask(tasks, 'move', { date: '2026-09-12', sectionId: null }, 1)
    expect(inScope(result, '2026-09-12::root').map((t) => t.id)).toEqual(['a', 'move', 'b'])
  })

  test('sin índice, va al final', () => {
    const tasks = [task({ id: 'a', order: 0 }), task({ id: 'move', order: 1, date: '2026-09-12' })]
    const result = moveTask(tasks, 'move', { date: '2026-09-11', sectionId: null })
    expect(inScope(result, '2026-09-11::root').map((t) => t.id)).toEqual(['a', 'move'])
  })

  test('compacta el scope de origen al salir', () => {
    const tasks = [
      task({ id: 'a', order: 0 }),
      task({ id: 'move', order: 1 }),
      task({ id: 'c', order: 2 }),
    ]
    const result = moveTask(tasks, 'move', { date: null, sectionId: null })
    expect(inScope(result, '2026-09-11::root').map((t) => t.order)).toEqual([0, 1])
  })

  test('cambiar de sección conserva el día', () => {
    const tasks = [task({ id: 'move' })]
    const result = moveTask(tasks, 'move', { date: '2026-09-11', sectionId: 'work' })
    expect(result[0]!.sectionId).toBe('work')
    expect(result[0]!.date).toBe('2026-09-11')
  })

  test('ignora ids inexistentes', () => {
    const tasks = [task({ id: 'a' })]
    expect(moveTask(tasks, 'nope', { date: null, sectionId: null })).toEqual(tasks)
  })
})

describe('byDisplay', () => {
  test('las completadas caen al final del bloque', () => {
    const list = [task({ id: 'a', order: 1 }), task({ id: 'done', order: 0, done: true })]
    expect([...list].sort(byDisplay).map((t) => t.id)).toEqual(['a', 'done'])
  })
})
