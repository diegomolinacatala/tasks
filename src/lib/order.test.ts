import { describe, expect, test } from 'vitest'
import type { Task } from '../types'
import { applyOrder, applyPlacements, byDisplay, inScope, moveTask, nextOrder, placementsOf, rescheduled, scopeKey, scopeOf } from './order'

const task = (partial: Partial<Task> & { id: string }): Task => ({
  title: partial.id,
  done: false,
  date: '2026-09-11',
  time: null,
  reminders: [],
  sectionId: null,
  order: 0,
  createdAt: 0,
  importance: 1,
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

describe('rescheduled', () => {
  const TODAY = '2026-09-12'
  const board = () => [
    task({ id: 'ayer-1', date: '2026-09-11', order: 0 }),
    task({ id: 'ayer-2', date: '2026-09-11', order: 1, sectionId: 'casa' }),
    task({ id: 'ayer-hecha', date: '2026-09-11', order: 2, done: true }),
    task({ id: 'antigua', date: '2026-09-01', order: 0 }),
    task({ id: 'hoy-1', date: TODAY, order: 0 }),
    task({ id: 'hoy-casa', date: TODAY, order: 0, sectionId: 'casa' }),
  ]
  const scope = (tasks: Task[], sectionId: string | null) => inScope(tasks, scopeKey(TODAY, sectionId)).map((t) => t.id)

  test('las sube arriba de su sección de hoy, en el orden dado', () => {
    const next = rescheduled(board(), ['antigua', 'ayer-1', 'ayer-2'], TODAY)
    expect(scope(next, null)).toEqual(['antigua', 'ayer-1', 'hoy-1'])
    expect(scope(next, 'casa')).toEqual(['ayer-2', 'hoy-casa'])
  })

  test('lo hecho y lo que ya es de ese día no se mueve; sin nada que mover, misma lista', () => {
    const tasks = board()
    expect(rescheduled(tasks, ['ayer-hecha', 'hoy-1', 'no-existe'], TODAY)).toBe(tasks)
  })

  test('repetirlo no cambia nada: ya no están atrasadas', () => {
    const once = rescheduled(board(), ['ayer-1', 'ayer-2'], TODAY)
    expect(rescheduled(once, ['ayer-1', 'ayer-2'], TODAY)).toBe(once)
  })

  test('no muta la lista original', () => {
    const tasks = board()
    rescheduled(tasks, ['ayer-1'], TODAY)
    expect(tasks.find((t) => t.id === 'ayer-1')!.date).toBe('2026-09-11')
  })
})

describe('placementsOf y applyPlacements', () => {
  test('deshacer devuelve cada tarea a su día, su sección y su puesto', () => {
    const tasks = [
      task({ id: 'x', date: '2026-09-11', order: 0 }),
      task({ id: 'a', date: '2026-09-11', order: 1 }),
      task({ id: 'y', date: '2026-09-11', order: 2 }),
      task({ id: 'b', date: '2026-09-11', order: 3 }),
      task({ id: 'c', date: '2026-09-10', order: 0, sectionId: 'casa' }),
      task({ id: 'hoy', date: '2026-09-12', order: 0 }),
    ]
    const before = placementsOf(tasks, ['b', 'c', 'a'])
    expect(before.map((p) => [p.id, p.index])).toEqual([
      ['c', 0],
      ['a', 1],
      ['b', 3],
    ])

    const restored = applyPlacements(rescheduled(tasks, ['b', 'c', 'a'], '2026-09-12'), before)
    expect(inScope(restored, '2026-09-11::root').map((t) => t.id)).toEqual(['x', 'a', 'y', 'b'])
    expect(inScope(restored, '2026-09-10::casa').map((t) => t.id)).toEqual(['c'])
    expect(inScope(restored, '2026-09-12::root').map((t) => t.id)).toEqual(['hoy'])
  })

  test('ignora ids que no existen y quita la sección a lo que va sin fecha', () => {
    const tasks = [task({ id: 'a', sectionId: 'casa' })]
    expect(placementsOf(tasks, ['nada'])).toEqual([])
    const [moved] = applyPlacements(tasks, [{ id: 'a', date: null, sectionId: 'casa', index: 0 }])
    expect(moved).toMatchObject({ date: null, sectionId: null })
  })
})
