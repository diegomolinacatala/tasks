import { describe, expect, test } from 'vitest'
import { toInstant } from './date'
import { parseTask } from './parse'

// Viernes 11 de septiembre de 2026, 10:00 hora local.
const NOW = toInstant('2026-09-11', '10:00')
const MINUTE = 60_000

const parse = (input: string, now = NOW) => parseTask(input, now)

describe('sin nada que detectar', () => {
  test.each(['comprar 5 manzanas', 'leer 20 páginas', 'mañanero', 'hoyo en el jardín', 'estudiar 2h'])(
    '«%s» queda literal',
    (input) => {
      expect(parse(input)).toEqual({ title: input, date: null, time: null, reminders: [], label: null })
    },
  )

  test('si al quitar lo detectado no queda título, se deja literal', () => {
    expect(parse('mañana').title).toBe('mañana')
    expect(parse('mañana').date).toBeNull()
  })
})

describe('días', () => {
  test.each([
    ['comprar pan hoy', '2026-09-11', 'Hoy'],
    ['comprar pan mañana', '2026-09-12', 'Mañana'],
    ['comprar pan pasado mañana', '2026-09-13', null],
    ['Comprar pan MAÑANA', '2026-09-12', 'Mañana'],
  ])('«%s»', (input, date, label) => {
    const result = parse(input)
    expect(result.title.toLowerCase()).toBe('comprar pan')
    expect(result.date).toBe(date)
    expect(result.time).toBeNull()
    expect(result.reminders).toEqual([])
    if (label) expect(result.label).toBe(label)
  })

  test.each([
    ['reunión el lunes', '2026-09-14'],
    ['reunión lunes', '2026-09-14'],
    ['reunión el próximo miércoles', '2026-09-16'],
    ['reunión el viernes', '2026-09-18'],
    ['reunión el jueves que viene', '2026-09-17'],
  ])('día de la semana: «%s»', (input, date) => {
    expect(parse(input)).toMatchObject({ title: 'reunión', date })
  })

  test.each([
    ['dentista el 15 de octubre', '2026-10-15'],
    ['dentista 15 oct', '2026-10-15'],
    ['dentista 3 sept', '2027-09-03'],
    ['dentista el 15/10', '2026-10-15'],
    ['dentista 1/3/2027', '2027-03-01'],
    ['dentista 20 de septiembre de 2028', '2028-09-20'],
  ])('fecha concreta: «%s»', (input, date) => {
    expect(parse(input)).toMatchObject({ title: 'dentista', date })
  })

  test('una fecha ya pasada este año se entiende para el siguiente', () => {
    expect(parse('renovar DNI 1/2').date).toBe('2027-02-01')
  })

  test('descarta fechas imposibles', () => {
    expect(parse('algo 31/2').date).toBeNull()
  })
})

describe('horas', () => {
  test.each([
    ['llamar a Juan a las 17', '17:00'],
    ['llamar a Juan a las 17:30', '17:30'],
    ['llamar a Juan 17:30', '17:30'],
    ['llamar a Juan 17h', '17:00'],
    ['llamar a Juan 17h30', '17:30'],
    ['llamar a Juan a las 5', '17:00'],
    ['llamar a Juan a las 9', '09:00'],
    ['llamar a Juan a las 5 de la tarde', '17:00'],
    ['llamar a Juan a las 11 de la mañana', '11:00'],
    ['llamar a Juan a las 10 de la noche', '22:00'],
    ['llamar a Juan 8pm', '20:00'],
    ['llamar a Juan 12am', '00:00'],
    ['llamar a Juan a las 6 y media', '18:30'],
    ['llamar a Juan a las 8 y cuarto', '08:15'],
    ['llamar a Juan a las 9 menos cuarto', '08:45'],
  ])('«%s» → %s', (input, time) => {
    const result = parse(input)
    expect(result.title).toBe('llamar a Juan')
    expect(result.time).toBe(time)
    expect(result.reminders).toEqual([{ kind: 'before', minutes: 0 }])
  })

  test('una hora futura sin día es para hoy', () => {
    expect(parse('llamar a las 17').date).toBe('2026-09-11')
  })

  test('una hora ya pasada sin día es para mañana', () => {
    expect(parse('llamar a las 9:00').date).toBe('2026-09-12')
  })

  test('día y hora juntos', () => {
    expect(parse('llamar a Juan mañana a las 17')).toEqual({
      title: 'llamar a Juan',
      date: '2026-09-12',
      time: '17:00',
      reminders: [{ kind: 'before', minutes: 0 }],
      label: 'Mañana 17:00',
    })
  })

  test('mañana por la mañana', () => {
    expect(parse('correr mañana por la mañana')).toMatchObject({ title: 'correr', date: '2026-09-12', time: '09:00' })
  })

  test('esta tarde implica hoy', () => {
    expect(parse('llamar esta tarde')).toMatchObject({ title: 'llamar', date: '2026-09-11', time: '18:00' })
  })

  test('al mediodía', () => {
    expect(parse('comer con Ana el sábado al mediodía')).toMatchObject({
      title: 'comer con Ana',
      date: '2026-09-12',
      time: '14:00',
    })
  })

  test('fecha concreta con hora no confunde el día con la hora', () => {
    expect(parse('Cita médico el 15 de octubre a las 10:30')).toMatchObject({
      title: 'Cita médico',
      date: '2026-10-15',
      time: '10:30',
    })
  })

  test('rechaza horas imposibles', () => {
    expect(parse('algo a las 25').time).toBeNull()
    expect(parse('algo 17:75').time).toBeNull()
  })
})

describe('dentro de un rato', () => {
  test.each([
    ['sacar la ropa en 20 min', 20],
    ['sacar la ropa en 20 minutos', 20],
    ['sacar la ropa dentro de 2 horas', 120],
    ['sacar la ropa en 1h', 60],
    ['sacar la ropa en una hora', 60],
    ['sacar la ropa en media hora', 30],
  ])('«%s» crea un aviso a +%i min', (input, minutes) => {
    const result = parse(input)
    expect(result.title).toBe('sacar la ropa')
    expect(result.reminders).toEqual([{ kind: 'at', at: NOW + minutes * MINUTE }])
    expect(result.date).toBe('2026-09-11')
    expect(result.time).toBeNull()
  })

  test('redondea al minuto siguiente', () => {
    expect(parse('algo en 5 min', NOW + 1_500).reminders).toEqual([{ kind: 'at', at: NOW + 6 * MINUTE }])
  })

  test('la etiqueta muestra la hora del aviso', () => {
    expect(parse('algo en 30 min').label).toBe('Hoy 10:30')
  })

  test('cruza la medianoche', () => {
    const late = toInstant('2026-09-11', '23:30')
    expect(parse('algo en 2 horas', late).date).toBe('2026-09-12')
  })

  test.each([
    ['viaje en 3 días', '2026-09-14'],
    ['viaje en 2 semanas', '2026-09-25'],
  ])('«%s» fija el día sin aviso', (input, date) => {
    expect(parse(input)).toMatchObject({ title: 'viaje', date, reminders: [] })
  })

  test('"en media" sin horas no es un plazo', () => {
    expect(parse('algo en media semana').reminders).toEqual([])
  })
})

describe('limpieza del título', () => {
  test('quita conectores sueltos y comas colgantes', () => {
    expect(parse('llamar a Juan, mañana').title).toBe('llamar a Juan')
    expect(parse('para mañana preparar informe').title).toBe('preparar informe')
  })

  test('conserva mayúsculas y tildes del texto original', () => {
    expect(parse('Revisión del coche el miércoles').title).toBe('Revisión del coche')
  })
})
