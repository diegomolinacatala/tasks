import { describe, expect, test } from 'vitest'
import { inScope } from '../lib/order'
import type { AppState, Task } from '../types'
import type { Action } from './actions'
import { emptyState, reducer } from './reducer'

const TODAY = '2026-09-11'

const run = (state: AppState, ...actions: Action[]) => actions.reduce(reducer, state)

const withTasks = (...titles: string[]): AppState =>
  run(emptyState(), ...titles.map((title): Action => ({ type: 'task/add', title, date: TODAY, sectionId: null })))

const titles = (state: AppState) => inScope(state.tasks, `${TODAY}::root`).map((task) => task.title)

describe('task/add', () => {
  test('añade al final del día', () => {
    expect(titles(withTasks('uno', 'dos'))).toEqual(['uno', 'dos'])
  })

  test('normaliza espacios', () => {
    const state = run(emptyState(), { type: 'task/add', title: '  hola   mundo  ', date: null, sectionId: null })
    expect(state.tasks[0]!.title).toBe('hola mundo')
  })

  test('ignora títulos vacíos', () => {
    const state = run(emptyState(), { type: 'task/add', title: '   ', date: TODAY, sectionId: null })
    expect(state.tasks).toHaveLength(0)
  })

  test('no muta el estado anterior', () => {
    const before = emptyState()
    run(before, { type: 'task/add', title: 'x', date: TODAY, sectionId: null })
    expect(before.tasks).toHaveLength(0)
  })
})

describe('task/toggle', () => {
  test('marca y desmarca registrando el momento', () => {
    const state = withTasks('uno')
    const id = state.tasks[0]!.id
    const done = reducer(state, { type: 'task/toggle', id })
    expect(done.tasks[0]!.done).toBe(true)
    expect(done.tasks[0]!.completedAt).toBeTypeOf('number')

    const undone = reducer(done, { type: 'task/toggle', id })
    expect(undone.tasks[0]!.done).toBe(false)
    expect(undone.tasks[0]!.completedAt).toBeNull()
  })
})

describe('task/remove y task/restore', () => {
  test('borrar y deshacer devuelve la tarea intacta', () => {
    const state = withTasks('uno', 'dos')
    const victim = state.tasks[1] as Task
    const removed = reducer(state, { type: 'task/remove', id: victim.id })
    expect(removed.tasks).toHaveLength(1)

    const restored = reducer(removed, { type: 'task/restore', task: victim })
    expect(titles(restored)).toEqual(['uno', 'dos'])
  })

  test('restaurar dos veces no duplica', () => {
    const state = withTasks('uno')
    const restored = reducer(state, { type: 'task/restore', task: state.tasks[0]! })
    expect(restored.tasks).toHaveLength(1)
  })
})

describe('board/commit', () => {
  test('reescribe sección y orden en una sola pasada', () => {
    const state = withTasks('uno', 'dos', 'tres')
    const [a, b, c] = state.tasks as [Task, Task, Task]
    const next = reducer(state, {
      type: 'board/commit',
      columns: [
        { date: TODAY, sectionId: null, ids: [c.id] },
        { date: TODAY, sectionId: 'work', ids: [b.id, a.id] },
      ],
    })

    expect(inScope(next.tasks, `${TODAY}::root`).map((t) => t.title)).toEqual(['tres'])
    expect(inScope(next.tasks, `${TODAY}::work`).map((t) => t.title)).toEqual(['dos', 'uno'])
  })

  test('las tareas fuera del tablero no se tocan', () => {
    const state = run(withTasks('hoy'), { type: 'task/add', title: 'suelta', date: null, sectionId: null })
    const loose = state.tasks.find((t) => t.title === 'suelta')!
    const next = reducer(state, {
      type: 'board/commit',
      columns: [{ date: TODAY, sectionId: null, ids: [] }],
    })
    expect(next.tasks.find((t) => t.id === loose.id)).toEqual(loose)
  })
})

describe('board/commit entre bloques', () => {
  test('una columna sin fecha manda la tarea al backlog', () => {
    const state = withTasks('uno')
    const id = state.tasks[0]!.id
    const next = reducer(state, {
      type: 'board/commit',
      columns: [
        { date: TODAY, sectionId: null, ids: [] },
        { date: null, sectionId: null, ids: [id] },
      ],
    })
    expect(next.tasks[0]!.date).toBeNull()
    expect(next.tasks[0]!.order).toBe(0)
  })

  test('una tarea atrasada conserva su fecha si no entra en ninguna columna', () => {
    const state = run(emptyState(), { type: 'task/add', title: 'vieja', date: '2026-09-01', sectionId: null })
    const next = reducer(state, { type: 'board/commit', columns: [{ date: TODAY, sectionId: null, ids: [] }] })
    expect(next.tasks[0]!.date).toBe('2026-09-01')
  })
})

describe('block/toggle', () => {
  test('pliega y despliega cada bloque por separado', () => {
    const plegado = reducer(emptyState(), { type: 'block/toggle', block: 'backlog' })
    expect(plegado.collapsed).toEqual({ overdue: false, backlog: true })
    expect(reducer(plegado, { type: 'block/toggle', block: 'backlog' }).collapsed.backlog).toBe(false)
  })
})

describe('secciones', () => {
  test('se crean con orden incremental', () => {
    const state = run(emptyState(), { type: 'section/add', name: 'Casa' }, { type: 'section/add', name: 'Trabajo' })
    expect(state.sections.map((s) => s.order)).toEqual([0, 1])
  })

  test('borrar una sección devuelve sus tareas a la raíz del día', () => {
    const withSection = run(emptyState(), { type: 'section/add', name: 'Trabajo' })
    const sectionId = withSection.sections[0]!.id
    const state = run(
      withSection,
      { type: 'task/add', title: 'raíz', date: TODAY, sectionId: null },
      { type: 'task/add', title: 'dentro', date: TODAY, sectionId },
      { type: 'section/remove', id: sectionId },
    )

    expect(state.sections).toHaveLength(0)
    expect(titles(state)).toEqual(['raíz', 'dentro'])
  })

  test('colapsar alterna el estado', () => {
    const state = run(emptyState(), { type: 'section/add', name: 'Casa' })
    const id = state.sections[0]!.id
    expect(reducer(state, { type: 'section/toggle', id }).sections[0]!.collapsed).toBe(true)
  })
})

describe('state/clear', () => {
  test('deja el estado vacío y versionado', () => {
    const state = reducer(withTasks('uno'), { type: 'state/clear' })
    expect(state).toEqual(emptyState())
  })
})

describe('task/rename', () => {
  test('cambia el título', () => {
    const state = withTasks('viejo')
    const next = reducer(state, { type: 'task/rename', id: state.tasks[0]!.id, title: 'nuevo' })
    expect(next.tasks[0]!.title).toBe('nuevo')
  })

  test('ignora títulos en blanco', () => {
    const state = withTasks('viejo')
    const next = reducer(state, { type: 'task/rename', id: state.tasks[0]!.id, title: '  ' })
    expect(next.tasks[0]!.title).toBe('viejo')
  })
})

describe('task/move', () => {
  test('manda una tarea al backlog', () => {
    const state = withTasks('uno')
    const next = reducer(state, { type: 'task/move', id: state.tasks[0]!.id, date: null, sectionId: null })
    expect(next.tasks[0]!.date).toBeNull()
  })

  test('volver a elegir el mismo día y sección no la manda al final', () => {
    const state = withTasks('uno', 'dos', 'tres')
    const first = state.tasks[0]!
    expect(reducer(state, { type: 'task/move', id: first.id, date: TODAY, sectionId: null })).toBe(state)
    expect(titles(state)).toEqual(['uno', 'dos', 'tres'])
  })

  test('una tarea sin fecha pierde la sección', () => {
    const withSection = run(emptyState(), { type: 'section/add', name: 'Casa', id: 'casa' })
    const state = run(withSection, { type: 'task/add', title: 'uno', date: TODAY, sectionId: 'casa' })
    const id = state.tasks[0]!.id
    expect(reducer(state, { type: 'task/move', id, date: null, sectionId: 'casa' }).tasks[0]!.sectionId).toBeNull()
  })
})

describe('acciones sin efecto', () => {
  test('no crean estado nuevo: ni guardado ni sincronización de más', () => {
    const state = withTasks('uno', 'dos')
    const [a, b] = state.tasks as [Task, Task]
    expect(reducer(state, { type: 'task/rename', id: a.id, title: 'uno' })).toBe(state)
    expect(reducer(state, { type: 'task/toggle', id: 'nadie' })).toBe(state)
    expect(
      reducer(state, { type: 'board/commit', columns: [{ date: TODAY, sectionId: null, ids: [a.id, b.id] }] }),
    ).toBe(state)
  })

  test('crear una tarea sin fecha ignora la sección', () => {
    const state = run(emptyState(), { type: 'task/add', title: 'x', date: null, sectionId: 'casa' })
    expect(state.tasks[0]!.sectionId).toBeNull()
  })
})

describe('scope/reorder', () => {
  test('reescribe el orden del scope', () => {
    const state = withTasks('uno', 'dos')
    const [a, b] = state.tasks as [Task, Task]
    const next = reducer(state, { type: 'scope/reorder', scope: `${TODAY}::root`, ids: [b.id, a.id] })
    expect(titles(next)).toEqual(['dos', 'uno'])
  })
})

describe('sections/reorder', () => {
  test('aplica el nuevo orden', () => {
    const state = run(emptyState(), { type: 'section/add', name: 'A' }, { type: 'section/add', name: 'B' })
    const [a, b] = state.sections
    const next = reducer(state, { type: 'sections/reorder', ids: [b!.id, a!.id] })
    expect(next.sections.find((s) => s.id === b!.id)!.order).toBe(0)
  })

  test('ignora secciones que no aparecen en la lista', () => {
    const state = run(emptyState(), { type: 'section/add', name: 'A' })
    const next = reducer(state, { type: 'sections/reorder', ids: ['otro'] })
    expect(next.sections[0]!.order).toBe(0)
  })
})

describe('section/rename', () => {
  test('cambia el nombre y respeta los vacíos', () => {
    const state = run(emptyState(), { type: 'section/add', name: 'Casa' })
    const id = state.sections[0]!.id
    expect(reducer(state, { type: 'section/rename', id, name: 'Hogar' }).sections[0]!.name).toBe('Hogar')
    expect(reducer(state, { type: 'section/rename', id, name: ' ' }).sections[0]!.name).toBe('Casa')
  })

  test('ignora secciones sin nombre al crearlas', () => {
    expect(reducer(emptyState(), { type: 'section/add', name: '  ' }).sections).toHaveLength(0)
  })
})

describe('state/replace', () => {
  test('sustituye el estado completo', () => {
    const imported = withTasks('importada')
    expect(reducer(emptyState(), { type: 'state/replace', state: imported })).toEqual(imported)
  })
})

describe('task/add con hora y recordatorios', () => {
  test('guarda la hora válida y asigna id a cada recordatorio', () => {
    const state = run(emptyState(), {
      type: 'task/add',
      title: 'llamar',
      date: TODAY,
      sectionId: null,
      time: '17:00',
      reminders: [
        { kind: 'before', minutes: 0 },
        { kind: 'before', minutes: 0 },
        { kind: 'at', at: 1 },
      ],
    })
    const task = state.tasks[0]!
    expect(task.time).toBe('17:00')
    expect(task.reminders.map((r) => r.kind)).toEqual(['before', 'at'])
    expect(new Set(task.reminders.map((r) => r.id)).size).toBe(2)
  })

  test('descarta horas inválidas y arranca sin recordatorios por defecto', () => {
    const state = run(emptyState(), { type: 'task/add', title: 'x', date: TODAY, sectionId: null, time: '25:00' })
    expect(state.tasks[0]!.time).toBeNull()
    expect(state.tasks[0]!.reminders).toEqual([])
  })
})

describe('task/setTime', () => {
  test('pone y quita la hora', () => {
    const state = withTasks('uno')
    const id = state.tasks[0]!.id
    const timed = reducer(state, { type: 'task/setTime', id, time: '09:30' })
    expect(timed.tasks[0]!.time).toBe('09:30')
    expect(reducer(timed, { type: 'task/setTime', id, time: null }).tasks[0]!.time).toBeNull()
  })

  test('ignora horas inválidas y cambios nulos sin crear estado nuevo', () => {
    const state = withTasks('uno')
    const id = state.tasks[0]!.id
    expect(reducer(state, { type: 'task/setTime', id, time: '9:30' })).toBe(state)
    expect(reducer(state, { type: 'task/setTime', id, time: null })).toBe(state)
  })
})

describe('recordatorios', () => {
  test('añadir y quitar sin mutar', () => {
    const state = withTasks('uno')
    const taskId = state.tasks[0]!.id
    const added = reducer(state, { type: 'reminder/add', taskId, reminder: { kind: 'at', at: 5 } })
    expect(state.tasks[0]!.reminders).toEqual([])
    const reminderId = added.tasks[0]!.reminders[0]!.id
    const removed = reducer(added, { type: 'reminder/remove', taskId, reminderId })
    expect(removed.tasks[0]!.reminders).toEqual([])
  })

  test('quitar uno inexistente devuelve el mismo estado', () => {
    const state = withTasks('uno')
    expect(reducer(state, { type: 'reminder/remove', taskId: state.tasks[0]!.id, reminderId: 'x' })).toBe(state)
    expect(reducer(state, { type: 'reminder/add', taskId: 'nadie', reminder: { kind: 'at', at: 5 } })).toBe(state)
  })

  test('posponer sustituye los avisos ya sonados', () => {
    const state = withTasks('uno')
    const id = state.tasks[0]!.id
    const next = run(
      state,
      { type: 'reminder/add', taskId: id, reminder: { kind: 'at', at: 100 } },
      { type: 'task/snooze', id, at: 900, now: 500 },
    )
    expect(next.tasks[0]!.reminders.map((r) => (r.kind === 'at' ? r.at : null))).toEqual([900])
  })

  test('mandar a sin fecha conserva los recordatorios', () => {
    const state = run(withTasks('uno'), { type: 'task/setTime', id: withTasks('uno').tasks[0]!.id, time: '10:00' })
    const id = state.tasks[0]!.id
    const next = run(
      state,
      { type: 'reminder/add', taskId: id, reminder: { kind: 'before', minutes: 0 } },
      { type: 'task/move', id, date: null, sectionId: null },
    )
    expect(next.tasks[0]!.reminders).toHaveLength(1)
  })
})

describe('lugares', () => {
  const location = { lat: 39.47, lng: -0.38, address: 'Calle Colón 1' }

  test('añadir guarda el nombre limpio, sin ubicación y con el radio por defecto', () => {
    const state = run(emptyState(), { type: 'place/add', id: 'p1', name: '  Mercadona  ' })
    expect(state.places).toEqual([{ id: 'p1', name: 'Mercadona', location: null, radius: 150 }])
  })

  test('no añade nombres vacíos ni repetidos', () => {
    const state = run(emptyState(), { type: 'place/add', id: 'p1', name: 'Mercadona' })
    expect(reducer(state, { type: 'place/add', id: 'p2', name: '   ' })).toBe(state)
    expect(reducer(state, { type: 'place/add', id: 'p2', name: 'mercadona' })).toBe(state)
  })

  test('actualizar cambia ubicación, radio y nombre sin mutar', () => {
    const state = run(emptyState(), { type: 'place/add', id: 'p1', name: 'Mercadona' })
    const next = reducer(state, { type: 'place/update', id: 'p1', name: 'Mercadona Colón', location, radius: 50 })
    expect(state.places[0]!.location).toBeNull()
    expect(next.places[0]).toEqual({ id: 'p1', name: 'Mercadona Colón', location, radius: 100 })
    expect(reducer(next, { type: 'place/update', id: 'nadie', radius: 300 })).toBe(next)
  })

  test('borrar un lugar quita sus avisos de las tareas', () => {
    const state = run(
      emptyState(),
      { type: 'place/add', id: 'p1', name: 'Mercadona' },
      {
        type: 'task/add',
        title: 'pan',
        date: null,
        sectionId: null,
        reminders: [
          { kind: 'place', placeId: 'p1', on: 'arrive' },
          { kind: 'at', at: 5 },
        ],
      },
      { type: 'place/remove', id: 'p1' },
    )
    expect(state.places).toEqual([])
    expect(state.tasks[0]!.reminders.map((reminder) => reminder.kind)).toEqual(['at'])
  })
})
