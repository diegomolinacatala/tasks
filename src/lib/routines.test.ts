import { describe, expect, test } from 'vitest'
import type { Routine } from '../types'
import { toInstant } from './date'
import {
  ALL_DAYS,
  dayShift,
  occurrenceDate,
  routineDay,
  bestStreak,
  completionRate,
  ROUTINE_LOG_DAYS,
  cleanDays,
  daysLabel,
  isDue,
  isoWeekday,
  normalizeRoutine,
  recentDays,
  routineEntryId,
  routineProgress,
  routinesOn,
  streak,
  withDay,
} from './routines'

// 2026-09-28 es lunes; 2026-09-29, martes.
const MONDAY = '2026-09-28'
const TUESDAY = '2026-09-29'

const routine = (partial: Partial<Routine> & { id: string }): Routine => ({
  title: partial.id,
  emoji: null,
  days: [...ALL_DAYS],
  time: null,
  done: [],
  order: 0,
  createdAt: 0,
  ...partial,
})

describe('días de la semana', () => {
  test('isoWeekday cuenta de lunes (1) a domingo (7)', () => {
    expect(isoWeekday(MONDAY)).toBe(1)
    expect(isoWeekday(TUESDAY)).toBe(2)
    expect(isoWeekday('2026-10-04')).toBe(7)
  })

  test('cleanDays ordena, quita repetidos y lo que no es un día', () => {
    expect(cleanDays([5, 1, 5, 9, 0, 2.5, '3'])).toEqual([1, 5])
  })

  test('sin días válidos, todos: una rutina siempre toca algún día', () => {
    expect(cleanDays([])).toEqual([1, 2, 3, 4, 5, 6, 7])
  })

  test('isDue mira el día de la semana', () => {
    const gym = routine({ id: 'gym', days: [1, 4] })
    expect(isDue(gym, MONDAY)).toBe(true)
    expect(isDue(gym, TUESDAY)).toBe(false)
  })
})

describe('daysLabel', () => {
  test.each([
    [[1, 2, 3, 4, 5, 6, 7], 'Cada día'],
    [[1, 2, 3, 4, 5], 'Entre semana'],
    [[6, 7], 'Fines de semana'],
    [[1], 'Los lunes'],
    [[3], 'Los miércoles'],
    [[1, 3, 5], 'Lun, mié y vie'],
    [[2, 4], 'Mar y jue'],
  ])('%j → %s', (days, label) => {
    expect(daysLabel(days)).toBe(label)
  })
})

describe('withDay', () => {
  test('añade el día en orden y lo quita', () => {
    const added = withDay(['2026-09-27', '2026-09-29'], MONDAY, true)
    expect(added).toEqual(['2026-09-27', MONDAY, '2026-09-29'])
    expect(withDay(added, MONDAY, false)).toEqual(['2026-09-27', '2026-09-29'])
  })

  test('si ya está como se pide, devuelve el mismo array', () => {
    const done = [MONDAY]
    expect(withDay(done, MONDAY, true)).toBe(done)
    expect(withDay(done, TUESDAY, false)).toBe(done)
  })

  test('no crece sin límite: se quedan los días más recientes', () => {
    const full = Array.from({ length: ROUTINE_LOG_DAYS }, (_, index) => `2020-01-01-${String(index).padStart(3, '0')}`)
    const next = withDay(full, '2999-01-01', true)
    expect(next).toHaveLength(ROUTINE_LOG_DAYS)
    expect(next.at(-1)).toBe('2999-01-01')
    expect(next[0]).toBe(full[1])
  })
})

describe('streak', () => {
  test('cuenta los días seguidos hechos hasta hoy', () => {
    const daily = routine({ id: 'a', done: ['2026-09-26', '2026-09-27', MONDAY, TUESDAY] })
    expect(streak(daily, TUESDAY)).toBe(4)
  })

  test('si hoy aún no está hecha, la racha de ayer sigue viva', () => {
    const daily = routine({ id: 'a', done: ['2026-09-27', MONDAY] })
    expect(streak(daily, TUESDAY)).toBe(2)
  })

  test('un día que tocaba sin hacer la corta', () => {
    const daily = routine({ id: 'a', done: ['2026-09-26', MONDAY, TUESDAY] })
    expect(streak(daily, TUESDAY)).toBe(2)
  })

  test('los días que no tocan no la cortan', () => {
    // Lunes y jueves: jueves 24, lunes 28 hechos; martes 29 no toca.
    const gym = routine({ id: 'gym', days: [1, 4], done: ['2026-09-24', MONDAY] })
    expect(streak(gym, TUESDAY)).toBe(2)
  })

  test('sin nada hecho, cero', () => {
    expect(streak(routine({ id: 'a' }), TUESDAY)).toBe(0)
  })
})

describe('recentDays', () => {
  test('antes de crearla no tocaba, salvo lo que ya aparezca hecho', () => {
    const created = new Date(2026, 8, 29, 8).getTime()
    const days = recentDays(routine({ id: 'r', createdAt: created, done: ['2026-09-27'] }), TUESDAY, 3)
    expect(days.map((mark) => mark.due)).toEqual([true, false, true])
  })

  test('los últimos días, del más antiguo a hoy, con lo que tocaba y lo hecho', () => {
    const gym = routine({ id: 'gym', days: [1, 4], done: [MONDAY] })
    const days = recentDays(gym, TUESDAY, 3)
    expect(days).toEqual([
      { date: '2026-09-27', due: false, done: false },
      { date: MONDAY, due: true, done: true },
      { date: TUESDAY, due: false, done: false },
    ])
  })
})

describe('routinesOn y routineProgress', () => {
  const routines = [
    routine({ id: 'sin-hora', order: 0 }),
    routine({ id: 'tarde', time: '18:00', order: 1, done: [TUESDAY] }),
    routine({ id: 'manana', time: '10:00', order: 2 }),
    routine({ id: 'lunes', days: [1], order: 3 }),
  ]

  test('solo las que tocan, por hora y las que no tienen al final', () => {
    expect(routinesOn(routines, TUESDAY).map((item) => item.id)).toEqual(['manana', 'tarde', 'sin-hora'])
  })

  test('cuenta las hechas sobre las que tocan', () => {
    expect(routineProgress(routines, TUESDAY)).toEqual({ done: 1, total: 3 })
  })
})

describe('normalizeRoutine', () => {
  test('sanea lo que llega de fuera', () => {
    expect(
      normalizeRoutine({ id: 'r', title: '  Tomar   creatina ', days: [9, 1], time: '25:00', done: [TUESDAY, 'ayer', MONDAY, MONDAY], order: 'x' }),
    ).toMatchObject({ id: 'r', title: 'Tomar creatina', emoji: null, days: [1], time: null, done: [MONDAY, TUESDAY], order: 0 })
  })

  test('el emoji se queda en uno solo; lo que no lo es, fuera', () => {
    expect(normalizeRoutine({ id: 'r', title: 'Creatina', emoji: '💊💧' })?.emoji).toBe('💊')
    expect(normalizeRoutine({ id: 'r', title: 'Creatina', emoji: 'TC' })?.emoji).toBeNull()
    expect(normalizeRoutine({ id: 'r', title: 'Creatina', emoji: 3 })?.emoji).toBeNull()
  })

  test('sin id o sin título no es una rutina', () => {
    expect(normalizeRoutine({ title: 'x' })).toBeNull()
    expect(normalizeRoutine({ id: 'r', title: '   ' })).toBeNull()
    expect(normalizeRoutine('rutina')).toBeNull()
  })
})

test('routineEntryId es estable y lleva el día sin guiones', () => {
  expect(routineEntryId('abc', TUESDAY)).toBe('routine-abc-20260929')
})

describe('estadísticas', () => {
  test('bestStreak encuentra la racha más larga del diario', () => {
    const daily = routine({ id: 'a', done: ['2026-09-20', '2026-09-21', '2026-09-22', '2026-09-24', '2026-09-25'] })
    expect(bestStreak(daily, TUESDAY)).toBe(3)
    expect(bestStreak(routine({ id: 'b' }), TUESDAY)).toBe(0)
  })

  test('completionRate: lo hecho de lo que tocaba, sin contar hoy si aún no está', () => {
    // Creada hace 4 días (sábado 26): tocaban 26, 27 y 28; hechos 26 y 28. Hoy no está hecha.
    const created = new Date(2026, 8, 26, 9).getTime()
    const daily = routine({ id: 'a', createdAt: created, done: ['2026-09-26', MONDAY] })
    expect(completionRate(daily, TUESDAY)).toBeCloseTo(2 / 3)
    expect(completionRate({ ...daily, done: [...daily.done, TUESDAY] }, TUESDAY)).toBeCloseTo(3 / 4)
  })

  test('completionRate sin días que tocaran es null', () => {
    const created = new Date(2026, 8, 29, 9).getTime()
    expect(completionRate(routine({ id: 'a', createdAt: created }), TUESDAY)).toBeNull()
  })
})

describe('el día de las rutinas', () => {
  test('a medianoche, el del calendario', () => {
    expect(dayShift('00:00')).toBe(0)
    expect(routineDay(toInstant(TUESDAY, '00:30'), '00:00')).toBe(TUESDAY)
  })

  test('si empieza de madrugada, lo de antes cuenta para la víspera', () => {
    expect(dayShift('04:00')).toBe(240)
    expect(routineDay(toInstant(TUESDAY, '01:30'), '04:00')).toBe(MONDAY)
    expect(routineDay(toInstant(TUESDAY, '04:00'), '04:00')).toBe(TUESDAY)
  })

  test('si empieza por la noche, a esa hora ya es el día siguiente', () => {
    expect(dayShift('22:00')).toBe(-120)
    expect(routineDay(toInstant(MONDAY, '21:59'), '22:00')).toBe(MONDAY)
    expect(routineDay(toInstant(MONDAY, '22:00'), '22:00')).toBe(TUESDAY)
  })

  test('una hora rota es medianoche', () => {
    expect(dayShift('mañana')).toBe(0)
  })

  test('el aviso de la madrugada de un día que empieza a las 4 suena al día siguiente', () => {
    expect(occurrenceDate(MONDAY, '01:00', '04:00')).toBe(TUESDAY)
    expect(occurrenceDate(MONDAY, '10:00', '04:00')).toBe(MONDAY)
    expect(occurrenceDate(TUESDAY, '23:00', '22:00')).toBe(MONDAY)
    expect(occurrenceDate(MONDAY, '01:00', '00:00')).toBe(MONDAY)
  })
})

describe('rehacer el historial', () => {
  test('una rutina recreada hoy recupera su racha al marcar los días de antes de crearla', () => {
    const created = toInstant(TUESDAY, '09:00')
    const days = ['2026-09-24', '2026-09-25', '2026-09-26', '2026-09-27', MONDAY]
    const rebuilt = days.reduce((acc, day) => ({ ...acc, done: withDay(acc.done, day, true) }), routine({ id: 'a', createdAt: created }))
    expect(streak(rebuilt, TUESDAY)).toBe(5)
    expect(bestStreak(rebuilt, TUESDAY)).toBe(5)
    // Lo marcado antes de crearla cuenta como día que tocaba.
    expect(recentDays(rebuilt, TUESDAY).filter((mark) => mark.done)).toHaveLength(5)
    expect(completionRate(rebuilt, TUESDAY)).toBe(1)
  })
})
