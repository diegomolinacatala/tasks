import { describe, expect, test } from 'vitest'
import type { Details } from './details'
import {
  addDetailReminder,
  blankDetails,
  detailsFrom,
  detailsSummary,
  draftTask,
  isRoutine,
  removeDetailReminder,
  toRoutineDraft,
  toTaskDraft,
  withDate,
  withDuration,
  withRepeat,
  withImportance,
  withSection,
  withTime,
} from './details'

const TODAY = '2026-10-01'
const TOMORROW = '2026-10-02'

let counter = 0
const newId = () => `id${++counter}`

const base = (patch: Partial<Details> = {}): Details => ({ ...blankDetails(TODAY), ...patch })

describe('detailsFrom', () => {
  test('sin nada entendido, solo el destino elegido', () => {
    expect(detailsFrom(null, null, TOMORROW, newId)).toEqual({
      date: TOMORROW,
      time: null,
      duration: null,
      reminders: [],
      sectionId: null,
      importance: 1,
      repeat: null,
    })
  })

  test('lo entendido de la frase pasa a los campos, con un id por aviso', () => {
    const details = detailsFrom(
      { title: 'Cena', date: TODAY, time: '20:00', duration: 90, reminders: [{ kind: 'before', minutes: 30 }] },
      null,
      null,
      newId,
    )
    expect(details).toMatchObject({ date: TODAY, time: '20:00', duration: 90, repeat: null })
    expect(details.reminders).toHaveLength(1)
    expect(details.reminders[0]).toMatchObject({ kind: 'before', minutes: 30 })
    expect(details.reminders[0]?.id).toMatch(/^id/)
  })

  test('conserva el lugar nuevo que se nombró', () => {
    const details = detailsFrom(
      { title: 'Pan', date: null, time: null, duration: null, reminders: [], newPlace: { name: 'Mercadona', on: 'arrive' } },
      null,
      TODAY,
      newId,
    )
    expect(details.newPlace).toEqual({ name: 'Mercadona', on: 'arrive' })
  })

  test('una rutina entendida: sus días y su hora, y el día de destino por si deja de repetirse', () => {
    expect(detailsFrom(null, { days: [1, 3], time: '10:00' }, TODAY, newId)).toMatchObject({
      date: TODAY,
      time: '10:00',
      repeat: [1, 3],
    })
  })
})

describe('withDate', () => {
  test('sin fecha no hay hora, duración, sección ni avisos relativos a la hora', () => {
    const details = base({
      time: '17:00',
      duration: 60,
      sectionId: 's',
      reminders: [
        { id: 'a', kind: 'before', minutes: 0 },
        { id: 'b', kind: 'at', at: 5 },
      ],
    })
    const moved = withDate(details, null)
    expect(moved).toMatchObject({ date: null, time: null, duration: null, sectionId: null })
    expect(moved.reminders.map((reminder) => reminder.id)).toEqual(['b'])
  })

  test('cambiar de día conserva lo demás y no muta', () => {
    const details = base({ time: '17:00', sectionId: 's' })
    const moved = withDate(details, TOMORROW)
    expect(moved).toMatchObject({ date: TOMORROW, time: '17:00', sectionId: 's' })
    expect(details.date).toBe(TODAY)
  })
})

describe('withTime', () => {
  test('poner hora añade el aviso "a la hora", como al escribirla', () => {
    const timed = withTime(base(), '17:30', newId)
    expect(timed.time).toBe('17:30')
    expect(timed.reminders).toEqual([expect.objectContaining({ kind: 'before', minutes: 0 })])
  })

  test('cambiar la hora no añade otro aviso', () => {
    const timed = withTime(withTime(base(), '17:30', newId), '18:00', newId)
    expect(timed.reminders).toHaveLength(1)
  })

  test('si ya había un aviso relativo, no se añade el de la hora', () => {
    const details = base({ reminders: [{ id: 'x', kind: 'before', minutes: 15 }] })
    expect(withTime(details, '9:00' as never, newId)).toBe(details)
    expect(withTime(details, '09:00', newId).reminders).toHaveLength(1)
  })

  test('quitar la hora quita la duración y los avisos relativos', () => {
    const timed = withDuration(withTime(base(), '17:30', newId), 60)
    const untimed = withTime(timed, null, newId)
    expect(untimed).toMatchObject({ time: null, duration: null, reminders: [] })
  })

  test('sin fecha no hay hora', () => {
    const undated = base({ date: null })
    expect(withTime(undated, '10:00', newId)).toBe(undated)
  })

  test('una rutina tiene hora aunque no tenga día, sin aviso añadido', () => {
    const routine = withRepeat(base({ date: null }), [1])
    expect(withTime(routine, '10:00', newId)).toMatchObject({ time: '10:00', reminders: [] })
  })
})

describe('withDuration', () => {
  test('solo con hora, y dentro de los límites', () => {
    expect(withDuration(base(), 60).duration).toBeNull()
    const timed = withTime(base(), '10:00', newId)
    expect(withDuration(timed, 90).duration).toBe(90)
    expect(withDuration(timed, null).duration).toBeNull()
    expect(withDuration(timed, 2).duration).toBe(5)
  })
})

describe('avisos', () => {
  test('añadir y quitar, sin repetir el mismo', () => {
    const one = addDetailReminder(base(), { kind: 'at', at: 1000 }, 'r1')
    expect(addDetailReminder(one, { kind: 'at', at: 1000 }, 'r2')).toBe(one)
    const two = addDetailReminder(one, { kind: 'before', minutes: 15 }, 'r2')
    expect(two.reminders.map((reminder) => reminder.id)).toEqual(['r1', 'r2'])
    expect(removeDetailReminder(two, 'r1').reminders.map((reminder) => reminder.id)).toEqual(['r2'])
  })
})

describe('withImportance', () => {
  test('del 1 al 10', () => {
    expect(withImportance(base(), 7).importance).toBe(7)
    expect(withImportance(base(), 0).importance).toBe(1)
    expect(withImportance(base(), 99).importance).toBe(10)
  })
})

describe('withSection y withRepeat', () => {
  test('la sección solo cuenta con fecha', () => {
    expect(withSection(base(), 's').sectionId).toBe('s')
    expect(withSection(base({ date: null }), 's').sectionId).toBeNull()
  })

  test('dejar de repetir sin fecha quita la hora (una tarea sin día no la tiene)', () => {
    const routine = withTime(withRepeat(base({ date: null }), [1]), '10:00', newId)
    expect(withRepeat(routine, null)).toMatchObject({ repeat: null, time: null })
    const dated = withTime(withRepeat(base(), [1]), '10:00', newId)
    expect(withRepeat(dated, null)).toMatchObject({ repeat: null, time: '10:00' })
  })

  test('repetir limpia los días; sin días deja de repetirse', () => {
    expect(withRepeat(base(), [3, 1, 3, 9]).repeat).toEqual([1, 3])
    expect(withRepeat(base(), []).repeat).toBeNull()
    expect(withRepeat(base(), null).repeat).toBeNull()
    expect(isRoutine(withRepeat(base(), [1]))).toBe(true)
    expect(isRoutine(base())).toBe(false)
  })
})

describe('toTaskDraft', () => {
  test('lo que se añade: sin ids de aviso, con importancia y sección', () => {
    const details = withSection(
      { ...withTime(base(), '17:30', newId), importance: 6, newPlace: { name: 'Casa', on: 'leave' } },
      'trabajo',
    )
    expect(toTaskDraft(details, '  Llamar a Ana  ')).toEqual({
      title: 'Llamar a Ana',
      date: TODAY,
      time: '17:30',
      duration: null,
      reminders: [{ kind: 'before', minutes: 0 }],
      importance: 6,
      sectionId: 'trabajo',
      newPlace: { name: 'Casa', on: 'leave' },
    })
  })
})

describe('draftTask', () => {
  test('la tarea tal como quedaría, pendiente', () => {
    const task = draftTask(withTime(base(), '10:00', newId), 'Correr')
    expect(task).toMatchObject({ title: 'Correr', done: false, date: TODAY, time: '10:00', importance: 1 })
    expect(task.reminders).toHaveLength(1)
  })
})

describe('toRoutineDraft', () => {
  test('solo si se repite', () => {
    expect(toRoutineDraft(base(), 'Leer')).toBeNull()
    expect(toRoutineDraft(withRepeat({ ...base(), time: '22:30' }, [1, 2, 3, 4, 5]), ' Leer ')).toEqual({
      title: 'Leer',
      days: [1, 2, 3, 4, 5],
      time: '22:30',
      label: 'Entre semana · 22:30',
    })
  })
})

describe('detailsSummary', () => {
  const sections = [{ id: 'trabajo', name: 'Trabajo', order: 0, collapsed: false }]

  test('lo mínimo: el día', () => {
    expect(detailsSummary(base(), TODAY, sections, [])).toEqual([{ key: 'when', label: 'Hoy', icon: null }])
    expect(detailsSummary(base({ date: null }), TODAY, sections, [])).toEqual([{ key: 'when', label: 'Sin fecha', icon: null }])
  })

  test('día con tramo, avisos, sección e importancia', () => {
    const details = {
      ...withDuration(withTime(base({ date: TOMORROW }), '17:30', newId), 60),
      sectionId: 'trabajo',
      importance: 7,
    }
    expect(detailsSummary(details, TODAY, sections, []).map((item) => item.label)).toEqual([
      'Mañana · 17:30–18:30',
      'A la hora',
      'Trabajo',
      '7',
    ])
  })

  test('varios avisos se cuentan; un lugar nuevo sale con su nombre', () => {
    const details = {
      ...base(),
      reminders: [
        { id: 'a', kind: 'at' as const, at: 1 },
        { id: 'b', kind: 'at' as const, at: 2 },
      ],
      newPlace: { name: 'Mercadona', on: 'arrive' as const },
    }
    expect(detailsSummary(details, TODAY, sections, [])).toEqual([
      { key: 'when', label: 'Hoy', icon: null },
      { key: 'reminders', label: '2 avisos', icon: 'bell' },
      { key: 'place', label: 'Mercadona', icon: 'pin' },
    ])
  })

  test('una rutina se resume en sus días y su hora', () => {
    const routine = withRepeat({ ...base(), time: '10:00', importance: 5 }, [1, 2, 3, 4, 5, 6, 7])
    expect(detailsSummary(routine, TODAY, sections, [])).toEqual([{ key: 'repeat', label: 'Cada día · 10:00', icon: 'repeat' }])
  })
})
