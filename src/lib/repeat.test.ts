import { describe, expect, test } from 'vitest'
import { toInstant } from './date'
import { parseRoutine, readRepeat, routineLabel } from './repeat'

const NOW = toInstant('2026-09-29', '12:00')

describe('parseRoutine', () => {
  test('"todos los días a las 10": cada día, con hora', () => {
    expect(parseRoutine('Tomar creatina todos los días a las 10', NOW)).toEqual({
      title: 'Tomar creatina',
      days: [1, 2, 3, 4, 5, 6, 7],
      time: '10:00',
      label: 'Cada día · 10:00',
    })
  })

  test('la frase puede ir delante y el título empieza en mayúscula', () => {
    expect(parseRoutine('cada día a las 22:30 leer', NOW)).toMatchObject({ title: 'Leer', time: '22:30' })
  })

  test('sin hora es una rutina sin aviso', () => {
    expect(parseRoutine('beber agua a diario', NOW)).toMatchObject({ title: 'Beber agua', time: null, label: 'Cada día' })
  })

  test('días sueltos: "los lunes y jueves", con la hora como en cualquier tarea ("a las 7" es por la tarde)', () => {
    expect(parseRoutine('gimnasio los lunes y jueves a las 7', NOW)).toMatchObject({ title: 'Gimnasio', days: [1, 4], time: '19:00' })
    expect(parseRoutine('gimnasio los lunes y jueves a las 7 de la mañana', NOW)?.time).toBe('07:00')
  })

  test('"cada martes", "todos los viernes"', () => {
    expect(parseRoutine('sacar la basura cada martes', NOW)?.days).toEqual([2])
    expect(parseRoutine('todos los viernes cena con amigos', NOW)?.days).toEqual([5])
  })

  test('varios días con comas', () => {
    expect(parseRoutine('inglés los lunes, miércoles y viernes', NOW)).toMatchObject({ title: 'Inglés', days: [1, 3, 5] })
  })

  test('entre semana y fines de semana', () => {
    expect(parseRoutine('regar las plantas entre semana', NOW)?.days).toEqual([1, 2, 3, 4, 5])
    expect(parseRoutine('correr los fines de semana', NOW)?.days).toEqual([6, 7])
    expect(parseRoutine('fichar todos los días laborables', NOW)?.days).toEqual([1, 2, 3, 4, 5])
  })

  test('"todas las mañanas" pone la hora de la mañana', () => {
    expect(parseRoutine('meditar todas las mañanas', NOW)).toMatchObject({ title: 'Meditar', time: '09:00' })
  })

  test('un día concreto no es una rutina', () => {
    expect(parseRoutine('gimnasio el lunes a las 7', NOW)).toBeNull()
    expect(parseRoutine('comprar pan mañana', NOW)).toBeNull()
  })

  test('sin título no hay rutina', () => {
    expect(parseRoutine('todos los días', NOW)).toBeNull()
  })
})

describe('cada semana', () => {
  // Viernes 11 de septiembre de 2026.
  const friday = new Date(2026, 8, 11, 10).getTime()

  test('sin día, el de hoy', () => {
    expect(parseRoutine('ir en bici cada semana', friday)).toMatchObject({ title: 'Ir en bici', days: [5], label: 'Los viernes' })
  })

  test('con un día dicho, ese', () => {
    expect(parseRoutine('bici todas las semanas el martes a las 7', friday)).toMatchObject({ title: 'Bici', days: [2], time: '19:00' })
  })
})

test('readRepeat devuelve el texto sin la frase', () => {
  expect(readRepeat('Tomar creatina todos los días')).toEqual({ days: [1, 2, 3, 4, 5, 6, 7], rest: 'Tomar creatina', part: null })
})

test('routineLabel', () => {
  expect(routineLabel([1, 2, 3, 4, 5], '08:05')).toBe('Entre semana · 8:05')
  expect(routineLabel([6], null)).toBe('Los sábados')
})
