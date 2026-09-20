import { describe, expect, test } from 'vitest'
import type { Task } from '../types'
import { toInstant } from './date'
import {
  MAX_REMINDERS,
  isPending,
  nextReminderAt,
  normalizeReminder,
  reminderLabel,
  reminderPresets,
  resolveAt,
  snoozeOptions,
  snoozed,
  taskInstant,
  withReminder,
} from './reminders'

const TODAY = '2026-09-11'
const NOW = toInstant(TODAY, '10:00')
const MINUTE = 60_000

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

describe('resolveAt', () => {
  test('un `at` suena en su instante', () => {
    expect(resolveAt(task({ id: 'a' }), { kind: 'at', at: 123 })).toBe(123)
  })

  test('un `before` se calcula desde la fecha y hora de la tarea', () => {
    const t = task({ id: 'a', time: '17:00' })
    expect(resolveAt(t, { kind: 'before', minutes: 15 })).toBe(toInstant(TODAY, '16:45'))
  })

  test('un `before` sin hora o sin fecha queda inactivo', () => {
    expect(resolveAt(task({ id: 'a' }), { kind: 'before', minutes: 0 })).toBeNull()
    expect(resolveAt(task({ id: 'a', date: null, time: '17:00' }), { kind: 'before', minutes: 0 })).toBeNull()
    expect(taskInstant(task({ id: 'a', date: null, time: '17:00' }))).toBeNull()
  })

  test('un `before` sigue a la tarea cuando cambia de día', () => {
    const t = task({ id: 'a', date: '2026-09-12', time: '09:00' })
    expect(resolveAt(t, { kind: 'before', minutes: 60 })).toBe(toInstant('2026-09-12', '08:00'))
  })
})

describe('isPending / nextReminderAt', () => {
  const t = task({
    id: 'a',
    time: '12:00',
    reminders: [
      { id: 'r1', kind: 'at', at: NOW - MINUTE },
      { id: 'r2', kind: 'before', minutes: 30 },
      { id: 'r3', kind: 'at', at: NOW + 5 * MINUTE },
    ],
  })

  test('devuelve el aviso futuro más cercano', () => {
    expect(nextReminderAt(t, NOW)).toBe(NOW + 5 * MINUTE)
  })

  test('una tarea completada no tiene avisos pendientes', () => {
    expect(nextReminderAt({ ...t, done: true }, NOW)).toBeNull()
    expect(isPending({ ...t, done: true }, { kind: 'at', at: NOW + MINUTE }, NOW)).toBe(false)
  })

  test('lo pasado no está pendiente', () => {
    expect(isPending(t, { kind: 'at', at: NOW - MINUTE }, NOW)).toBe(false)
    expect(nextReminderAt(task({ id: 'b' }), NOW)).toBeNull()
  })
})

describe('withReminder / snoozed', () => {
  test('añade sin mutar la tarea original', () => {
    const original = task({ id: 'a' })
    const next = withReminder(original, { kind: 'at', at: NOW }, 'r1')
    expect(next.reminders).toEqual([{ id: 'r1', kind: 'at', at: NOW }])
    expect(original.reminders).toEqual([])
  })

  test('ignora duplicados equivalentes', () => {
    const once = withReminder(task({ id: 'a' }), { kind: 'before', minutes: 15 }, 'r1')
    expect(withReminder(once, { kind: 'before', minutes: 15 }, 'r2')).toBe(once)
  })

  test('respeta el tope por tarea', () => {
    const full = Array.from({ length: MAX_REMINDERS }, (_, i) => i).reduce(
      (acc, i) => withReminder(acc, { kind: 'at', at: NOW + i }, `r${i}`),
      task({ id: 'a' }),
    )
    expect(full.reminders).toHaveLength(MAX_REMINDERS)
    expect(withReminder(full, { kind: 'at', at: 1 }, 'x')).toBe(full)
  })

  test('posponer descarta los `at` ya pasados y conserva los futuros y relativos', () => {
    const t = task({
      id: 'a',
      reminders: [
        { id: 'old', kind: 'at', at: NOW - MINUTE },
        { id: 'future', kind: 'at', at: NOW + 60 * MINUTE },
        { id: 'rel', kind: 'before', minutes: 0 },
      ],
    })
    const next = snoozed(t, NOW + 10 * MINUTE, NOW, 'new')
    expect(next.reminders.map((r) => r.id)).toEqual(['future', 'rel', 'new'])
  })
})

describe('reminderLabel', () => {
  test('relativos', () => {
    expect(reminderLabel({ kind: 'before', minutes: 0 }, NOW)).toBe('A la hora')
    expect(reminderLabel({ kind: 'before', minutes: 15 }, NOW)).toBe('15 min antes')
    expect(reminderLabel({ kind: 'before', minutes: 120 }, NOW)).toBe('2 h antes')
    expect(reminderLabel({ kind: 'before', minutes: 1440 }, NOW)).toBe('1 día antes')
    expect(reminderLabel({ kind: 'before', minutes: 2880 }, NOW)).toBe('2 días antes')
  })

  test('absolutos con día relativo y hora sin cero inicial', () => {
    expect(reminderLabel({ kind: 'at', at: toInstant(TODAY, '18:00') }, NOW)).toBe('Hoy 18:00')
    expect(reminderLabel({ kind: 'at', at: toInstant('2026-09-12', '09:05') }, NOW)).toBe('Mañana 9:05')
  })
})

describe('reminderPresets', () => {
  const keys = (t: Task, now = NOW) => reminderPresets(t, now).map((preset) => preset.key)

  test('sin hora ofrece solo absolutos', () => {
    expect(keys(task({ id: 'a' }))).toEqual(['in-1h', 'evening', 'tomorrow'])
  })

  test('con hora ofrece también relativos futuros', () => {
    expect(keys(task({ id: 'a', time: '12:00' }))).toEqual([
      'on-time',
      'before-15',
      'before-60',
      'in-1h',
      'evening',
      'tomorrow',
    ])
  })

  test('descarta los que ya pasaron y los ya puestos', () => {
    const late = toInstant(TODAY, '19:00')
    const t = task({ id: 'a', reminders: [{ id: 'r', kind: 'at', at: toInstant('2026-09-12', '09:00') }] })
    expect(keys(t, late)).toEqual(['in-1h'])
  })

  test('para una tarea lejana ofrece la mañana de ese día', () => {
    const t = task({ id: 'a', date: '2026-09-20' })
    expect(keys(t)).toContain('day-of')
  })

  test('"en 1 h" se redondea al minuto', () => {
    const preset = reminderPresets(task({ id: 'a' }), NOW + 12_345).find((p) => p.key === 'in-1h')
    expect(preset?.draft).toEqual({ kind: 'at', at: NOW + 61 * MINUTE })
  })
})

describe('snoozeOptions', () => {
  test('+10 min, +1 h y mañana a las 9', () => {
    expect(snoozeOptions(NOW)).toEqual([
      { key: '10m', label: '+10 min', at: NOW + 10 * MINUTE },
      { key: '1h', label: '+1 h', at: NOW + 60 * MINUTE },
      { key: 'tomorrow', label: 'Mañana 9:00', at: toInstant('2026-09-12', '09:00') },
    ])
  })
})

describe('avisos de lugar', () => {
  const place = { kind: 'place', placeId: 'm', on: 'arrive' } as const

  test('no tienen instante: no cuentan como próximo aviso por hora', () => {
    const withPlace = task({ id: 'a', reminders: [{ ...place, id: 'r' }] })
    expect(resolveAt(withPlace, place)).toBeNull()
    expect(nextReminderAt(withPlace, NOW)).toBeNull()
  })

  test('están activos mientras la tarea siga pendiente', () => {
    expect(isPending(task({ id: 'a' }), place, NOW)).toBe(true)
    expect(isPending(task({ id: 'a', done: true }), place, NOW)).toBe(false)
  })

  test('no se repite el mismo lugar y sentido, pero llegar y salir conviven', () => {
    const once = withReminder(task({ id: 'a' }), place, 'r1')
    expect(withReminder(once, place, 'r2').reminders).toHaveLength(1)
    expect(withReminder(once, { ...place, on: 'leave' }, 'r3').reminders).toHaveLength(2)
  })

  test('posponer conserva los avisos de lugar', () => {
    const withPlace = task({ id: 'a', reminders: [{ ...place, id: 'r' }] })
    expect(snoozed(withPlace, NOW + MINUTE, NOW, 'n').reminders.map((reminder) => reminder.kind)).toEqual(['place', 'at'])
  })

  test('la etiqueta usa el nombre del lugar', () => {
    const places = [{ id: 'm', name: 'Mercadona', location: null, radius: 150 }]
    expect(reminderLabel(place, NOW, places)).toBe('Al llegar a Mercadona')
  })
})

describe('normalizeReminder', () => {
  test('acepta los tipos válidos', () => {
    expect(normalizeReminder({ id: 'a', kind: 'at', at: 10.4 })).toEqual({ id: 'a', kind: 'at', at: 10 })
    expect(normalizeReminder({ id: 'b', kind: 'before', minutes: 15 })).toEqual({ id: 'b', kind: 'before', minutes: 15 })
    expect(normalizeReminder({ id: 'c', kind: 'place', placeId: 'm', on: 'leave' })).toEqual({
      id: 'c',
      kind: 'place',
      placeId: 'm',
      on: 'leave',
    })
  })

  test.each([
    null,
    'x',
    { kind: 'at', at: 1 },
    { id: 'a', kind: 'at', at: -1 },
    { id: 'a', kind: 'at', at: Number.NaN },
    { id: 'a', kind: 'before', minutes: 1.5 },
    { id: 'a', kind: 'before', minutes: -1 },
    { id: 'a', kind: 'before', minutes: 999_999 },
    { id: 'a', kind: 'place', placeId: '', on: 'arrive' },
    { id: 'a', kind: 'place', placeId: 'm', on: 'pasar' },
    { id: 'a', kind: 'otro' },
  ])('rechaza %j', (raw) => {
    expect(normalizeReminder(raw)).toBeNull()
  })
})
