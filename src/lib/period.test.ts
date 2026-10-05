import { afterEach, describe, expect, test } from 'vitest'
import type { Task } from '../types'
import { toInstant } from './date'
import { setLanguage } from './i18n'
import { parseSpoken, parseTask, provideEnglish } from './parse'
import * as englishParser from './parseEn'
import {
  asOf,
  cleanUntil,
  dayOnOrAfter,
  endOfMonth,
  hasPeriod,
  isCarried,
  lastDay,
  onOrAfter,
  periodDays,
  periodLabel,
  periodTag,
  shownDay,
  weekendOf,
} from './period'

// Viernes 11 de septiembre de 2026, 10:00 hora local.
const TODAY = '2026-09-11'
const NOW = toInstant(TODAY, '10:00')

const task = (partial: Partial<Task> = {}): Task => ({
  id: 't',
  title: 'Llamar al banco',
  done: false,
  date: '2026-09-07',
  until: '2026-09-13',
  time: null,
  duration: null,
  reminders: [],
  sectionId: null,
  order: 0,
  importance: 1,
  createdAt: 0,
  completedAt: null,
  ...partial,
})

afterEach(() => setLanguage('es'))

describe('el día en que se ve', () => {
  test('sin plazo, el suyo', () => {
    const single = task({ until: null })
    expect(hasPeriod(single)).toBe(false)
    expect(shownDay(single, TODAY)).toBe('2026-09-07')
    expect(lastDay(single)).toBe('2026-09-07')
  })

  test('pendiente y dentro del plazo, va con hoy sin quedar atrasada', () => {
    expect(shownDay(task(), TODAY)).toBe(TODAY)
    expect(isCarried(task(), TODAY)).toBe(true)
    expect(lastDay(task())).toBe('2026-09-13')
  })

  test('antes de empezar, en su primer día; acabado, en el último', () => {
    expect(shownDay(task({ date: '2026-09-14', until: '2026-09-18' }), TODAY)).toBe('2026-09-14')
    expect(shownDay(task({ date: '2026-09-01', until: '2026-09-04' }), TODAY)).toBe('2026-09-04')
  })

  test('hecha, el día en que se hizo (dentro del plazo)', () => {
    expect(shownDay(task({ done: true, completedAt: toInstant('2026-09-09', '18:00') }), TODAY)).toBe('2026-09-09')
    expect(shownDay(task({ done: true, completedAt: toInstant('2026-09-20', '18:00') }), TODAY)).toBe('2026-09-13')
    expect(isCarried(task({ done: true, completedAt: toInstant('2026-09-07', '9:00') }), TODAY)).toBe(false)
  })

  test('un final que no va después del día no es un plazo', () => {
    expect(cleanUntil('2026-09-11', '2026-09-11')).toBeNull()
    expect(cleanUntil('2026-09-11', '2026-09-10')).toBeNull()
    expect(cleanUntil(null, '2026-09-20')).toBeNull()
    expect(cleanUntil('2026-09-11', 'el viernes')).toBeNull()
    expect(cleanUntil('2026-09-11', '2026-09-12')).toBe('2026-09-12')
  })

  test('los días que quedan, desde hoy y con tope', () => {
    expect(periodDays(task(), TODAY, 7)).toEqual(['2026-09-11', '2026-09-12', '2026-09-13'])
    expect(periodDays(task({ date: '2026-09-14', until: '2026-09-30' }), TODAY, 3)).toEqual(['2026-09-14', '2026-09-15', '2026-09-16'])
    expect(periodDays(task({ until: null, date: '2026-09-12' }), TODAY, 7)).toEqual(['2026-09-12'])
  })

  test('como cuenta hoy: con su hora en el día de hoy', () => {
    expect(asOf(task({ time: '10:00' }), TODAY)).toMatchObject({ date: TODAY, until: null, time: '10:00' })
    expect(asOf(task({ until: null }), TODAY).date).toBe('2026-09-07')
  })
})

describe('cómo se dice', () => {
  test('el plazo entero', () => {
    expect(periodLabel(TODAY, '2026-09-13', TODAY)).toBe('Esta semana')
    expect(periodLabel('2026-09-14', '2026-09-20', TODAY)).toBe('La semana que viene')
    expect(periodLabel('2026-09-12', '2026-09-13', TODAY)).toBe('Este fin de semana')
    expect(periodLabel(TODAY, '2026-09-30', TODAY)).toBe('Este mes')
    expect(periodLabel(TODAY, '2026-09-15', TODAY)).toBe('Hasta el martes')
    expect(periodLabel(TODAY, '2026-10-15', TODAY)).toBe('Hasta el 15 oct')
    expect(periodLabel('2026-09-14', '2026-09-16', TODAY)).toBe('Del 14 al 16 sept')
    expect(periodLabel('2026-09-28', '2026-10-03', TODAY)).toBe('Del 28 sept al 3 oct')
  })

  test('la fila: hasta cuándo, o que es el último día', () => {
    expect(periodTag(task(), TODAY)).toEqual({ label: 'Hasta el domingo', last: false })
    expect(periodTag(task(), '2026-09-13')).toEqual({ label: 'Último día', last: true })
    expect(periodTag(task(), '2026-09-14')).toBeNull()
    expect(periodTag(task({ done: true, completedAt: NOW }), TODAY)).toBeNull()
    expect(periodTag(task({ until: null }), TODAY)).toBeNull()
  })

  test('en inglés', () => {
    setLanguage('en')
    expect(periodLabel(TODAY, '2026-09-13', TODAY)).toBe('This week')
    expect(periodLabel(TODAY, '2026-09-15', TODAY)).toBe('Until Tuesday')
    expect(periodLabel('2026-09-14', '2026-09-16', TODAY)).toBe('Sep 14 – 16')
    expect(periodTag(task(), '2026-09-13')).toEqual({ label: 'Last day', last: true })
  })
})

describe('calendario', () => {
  test('último día del mes, también en diciembre y febrero', () => {
    expect(endOfMonth('2026-09-11')).toBe('2026-09-30')
    expect(endOfMonth('2026-12-05')).toBe('2026-12-31')
    expect(endOfMonth('2028-02-01')).toBe('2028-02-29')
  })

  test('el próximo día de la semana o del mes, hoy incluido', () => {
    expect(onOrAfter(TODAY, 5)).toBe(TODAY)
    expect(onOrAfter(TODAY, 1)).toBe('2026-09-14')
    expect(onOrAfter(TODAY, 0)).toBe('2026-09-13')
    expect(dayOnOrAfter(TODAY, 11)).toBe(TODAY)
    expect(dayOnOrAfter(TODAY, 3)).toBe('2026-10-03')
    expect(dayOnOrAfter(TODAY, 3, 9)).toBe('2027-09-03')
    expect(dayOnOrAfter(TODAY, 31)).toBe('2026-10-31')
    expect(dayOnOrAfter(TODAY, 40)).toBeNull()
  })

  test('el fin de semana: este, desde hoy si ya lo es, o el siguiente', () => {
    expect(weekendOf(TODAY, false)).toMatchObject({ start: '2026-09-12', end: '2026-09-13' })
    expect(weekendOf('2026-09-12', false)).toMatchObject({ start: '2026-09-12', end: '2026-09-13' })
    expect(weekendOf('2026-09-13', false)).toMatchObject({ start: '2026-09-13', end: '2026-09-13' })
    expect(weekendOf(TODAY, true)).toMatchObject({ start: '2026-09-19', end: '2026-09-20' })
  })
})

describe('al escribirlo', () => {
  test.each([
    ['llamar al banco esta semana', 'Llamar al banco', TODAY, '2026-09-13', 'Esta semana'],
    ['llamar al banco durante la semana', 'Llamar al banco', TODAY, '2026-09-13', 'Esta semana'],
    ['renovar el DNI la semana que viene', 'Renovar el DNI', '2026-09-14', '2026-09-20', 'La semana que viene'],
    ['ordenar el trastero este fin de semana', 'Ordenar el trastero', '2026-09-12', '2026-09-13', 'Este fin de semana'],
    ['pagar la cuota este mes', 'Pagar la cuota', TODAY, '2026-09-30', 'Este mes'],
    ['entregar el informe hasta el martes', 'Entregar el informe', TODAY, '2026-09-15', 'Hasta el martes'],
    ['entregar el informe hasta el 15 de octubre', 'Entregar el informe', TODAY, '2026-10-15', 'Hasta el 15 oct'],
    ['preparar el viaje del lunes al miércoles', 'Preparar el viaje', '2026-09-14', '2026-09-16', 'Del 14 al 16 sept'],
    ['pintar la valla entre el lunes y el jueves', 'Pintar la valla', '2026-09-14', '2026-09-17', 'Del 14 al 17 sept'],
    ['curso del 20 al 25', 'Curso', '2026-09-20', '2026-09-25', 'Del 20 al 25 sept'],
    ['mudanza del 28 de septiembre al 3 de octubre', 'Mudanza', '2026-09-28', '2026-10-03', 'Del 28 sept al 3 oct'],
  ])('«%s»', (input, title, date, until, label) => {
    expect(parseTask(input, NOW)).toMatchObject({ title: expect.stringMatching(new RegExp(`^${title}$`, 'i')), date, until, label })
  })

  test('con hora: la tarea es cada día a esa hora hasta hacerla', () => {
    expect(parseTask('llamar al banco esta semana a las 12', NOW)).toMatchObject({
      date: TODAY,
      until: '2026-09-13',
      time: '12:00',
      reminders: [{ kind: 'before', minutes: 0 }],
      label: 'Esta semana 12:00',
    })
  })

  test('un plazo que no dura más de un día es solo ese día', () => {
    const sunday = toInstant('2026-09-13', '10:00')
    const parsed = parseTask('ordenar el trastero este fin de semana', sunday)
    expect(parsed).toMatchObject({ date: '2026-09-13', label: 'Hoy' })
    expect(parsed.until).toBeUndefined()
  })

  test('«la semana que viene, el miércoles» sigue siendo ese día', () => {
    const parsed = parseTask('la semana que viene, el miércoles, dentista', NOW)
    expect(parsed.date).toBe('2026-09-16')
    expect(parsed.until).toBeUndefined()
  })

  test('las horas con «hasta» siguen siendo horas', () => {
    expect(parseTask('reunión a las 17 hasta las 19', NOW)).toMatchObject({ time: '17:00', duration: 120 })
    expect(parseTask('reunión a las 17 hasta las 19', NOW).until).toBeUndefined()
  })

  test('con un día dicho, «esta semana» solo dice cuál', () => {
    const parsed = parseTask('revisar el informe el viernes de esta semana', NOW)
    expect(parsed).toMatchObject({ title: 'revisar el informe', date: '2026-09-18' })
    expect(parsed.until).toBeUndefined()
    expect(parseTask('reunión el domingo esta semana a las 5', NOW)).toMatchObject({ date: '2026-09-13', time: '17:00' })
    expect(parseTask('reunión el domingo esta semana a las 5', NOW).until).toBeUndefined()
  })

  test('«hasta el viernes a las 5» es una hora límite: la de su último día', () => {
    const parsed = parseTask('entregar el informe hasta el martes a las 5', NOW)
    expect(parsed).toMatchObject({ title: 'entregar el informe', date: '2026-09-15', time: '17:00' })
    expect(parsed.until).toBeUndefined()
  })

  test('«del 28 al 3 de octubre» empieza en septiembre; un rango absurdo no es un plazo', () => {
    expect(parseTask('mudanza del 28 al 3 de octubre', NOW)).toMatchObject({ date: '2026-09-28', until: '2026-10-03' })
    expect(parseTask('curso hasta el lunes que viene', NOW)).toMatchObject({ title: 'curso', until: '2026-09-14' })
  })

  test('dictado', () => {
    expect(parseSpoken('bueno, esta semana tengo que llamar al banco', NOW)).toMatchObject({ date: TODAY, until: '2026-09-13' })
  })

  test('en inglés', () => {
    provideEnglish(englishParser)
    setLanguage('en')
    expect(parseTask('call the bank this week', NOW)).toMatchObject({ title: 'call the bank', date: TODAY, until: '2026-09-13', label: 'This week' })
    expect(parseTask('book flights next week', NOW)).toMatchObject({ date: '2026-09-14', until: '2026-09-20', label: 'Next week' })
    expect(parseTask('mow the lawn this weekend', NOW)).toMatchObject({ date: '2026-09-12', until: '2026-09-13' })
    expect(parseTask('send the report by tuesday', NOW)).toMatchObject({ title: 'send the report', until: '2026-09-15', label: 'Until Tuesday' })
    expect(parseTask('pay rent until Oct 15', NOW)).toMatchObject({ until: '2026-10-15' })
    expect(parseTask('paint the fence between monday and thursday', NOW)).toMatchObject({ date: '2026-09-14', until: '2026-09-17' })
    expect(parseTask('meeting friday next week', NOW)).toMatchObject({ date: '2026-09-18' })
    expect(parseTask('meeting friday next week', NOW).until).toBeUndefined()
    expect(parseTask('meeting friday this week at 3pm', NOW)).toMatchObject({ date: '2026-09-18', time: '15:00' })
    expect(parseTask('send the report by tomorrow at 5pm', NOW)).toMatchObject({ date: '2026-09-12', time: '17:00' })
    expect(parseTask('send the report by tomorrow at 5pm', NOW).until).toBeUndefined()
  })
})
