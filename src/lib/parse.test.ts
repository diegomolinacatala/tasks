import { describe, expect, test } from 'vitest'
import { toInstant } from './date'
import { parseSpoken, parseTask } from './parse'

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

describe('frases dictadas', () => {
  test('el ejemplo completo: tarea, día, hora y aviso 10 minutos antes', () => {
    expect(parse('llamar a miguel hoy a las 17:00 y recordarlo 10 minutos antes')).toEqual({
      title: 'llamar a miguel',
      date: '2026-09-11',
      time: '17:00',
      reminders: [{ kind: 'before', minutes: 10 }],
      label: 'Hoy 17:00 · 10 min antes',
    })
  })

  test('como lo transcribe un motor de voz: mayúscula, punto final y "horas"', () => {
    expect(parse('Llamar a Miguel hoy a las 17:00 horas y recuérdamelo 10 minutos antes.')).toMatchObject({
      title: 'Llamar a Miguel',
      time: '17:00',
      reminders: [{ kind: 'before', minutes: 10 }],
    })
  })

  test('números escritos en palabras', () => {
    expect(parse('llamar a miguel hoy a las cinco de la tarde y avísame diez minutos antes')).toMatchObject({
      title: 'llamar a miguel',
      time: '17:00',
      reminders: [{ kind: 'before', minutes: 10 }],
    })
    expect(parse('dentista mañana a las once y media')).toMatchObject({ title: 'dentista', time: '11:30' })
    expect(parse('pagar la luz en veinte minutos').reminders).toEqual([{ kind: 'at', at: NOW + 20 * MINUTE }])
  })

  test('"una" como artículo no se convierte en hora', () => {
    expect(parse('comprar una barra de pan')).toEqual(literal('comprar una barra de pan'))
  })

  test('varios avisos a la vez', () => {
    expect(
      parse('reunión el lunes a las 10 y recuérdamelo el día antes y media hora antes').reminders,
    ).toEqual([
      { kind: 'before', minutes: 1440 },
      { kind: 'before', minutes: 30 },
    ])
  })

  test('aviso a una hora concreta distinta de la de la tarea', () => {
    expect(parse('entregar informe mañana a las 12 y avísame a las 9')).toMatchObject({
      title: 'entregar informe',
      date: '2026-09-12',
      time: '12:00',
      reminders: [{ kind: 'at', at: toInstant('2026-09-12', '09:00') }],
      label: 'Mañana 12:00 · Mañana 9:00',
    })
  })

  test('aviso a una hora sin hora de tarea', () => {
    expect(parse('sacar la basura y avísame a las 21:30')).toMatchObject({
      title: 'sacar la basura',
      date: '2026-09-11',
      time: null,
      reminders: [{ kind: 'at', at: toInstant('2026-09-11', '21:30') }],
    })
  })

  test('"avísame a la hora" deja un único aviso a la hora', () => {
    expect(parse('clase de inglés el jueves a las 19 y avísame a la hora').reminders).toEqual([
      { kind: 'before', minutes: 0 },
    ])
  })

  test('quita la muletilla inicial del dictado', () => {
    expect(parse('Recuérdame llamar a Ana mañana').title).toBe('Llamar a Ana')
    expect(parse('añade comprar leche hoy').title).toBe('Comprar leche')
  })

  test('sin nada más detectado, la muletilla se respeta', () => {
    expect(parse('recordar cumpleaños de Ana').title).toBe('recordar cumpleaños de Ana')
  })

  test('"estudiar 2 horas" no es una hora', () => {
    expect(parse('estudiar 2 horas').time).toBeNull()
  })
})

describe('dictado: tema, fecha y avisos por separado', () => {
  const at = (day: string, time: string) => ({ kind: 'at', at: toInstant(day, time) })
  const before = (minutes: number) => ({ kind: 'before', minutes })

  test('la cena de hoy a las 20:00 con aviso media hora antes', () => {
    const text = 'bueno hoy tengo que acudir a una cena a las 20:00, me gustaría que me lo recordaras media hora antes'
    expect(parseSpoken(text, NOW)).toEqual({
      title: 'Cena',
      date: '2026-09-11',
      time: '20:00',
      reminders: [before(30)],
      label: 'Hoy 20:00 · 30 min antes',
    })
  })

  test.each([
    ['yoga el martes a las 19 y avísame un cuarto de hora antes', 15],
    ['yoga el martes a las 19, recuérdamelo una hora y media antes', 90],
    ['yoga el martes a las 19, avísame hora y cuarto antes', 75],
    ['yoga el martes a las 19, avísame con tres cuartos de hora de antelación', 45],
    ['yoga el martes a las 19 y que me avises con una hora de antelación', 60],
    ['yoga el martes a las 19, avísame el día anterior', 1440],
  ])('«%s» → %i min antes', (input, minutes) => {
    expect(parse(input)).toMatchObject({ title: 'yoga', date: '2026-09-15', time: '19:00', reminders: [before(minutes)] })
  })

  test('aviso días antes a una hora concreta', () => {
    expect(parse('renovar el seguro el 30 de septiembre, recuérdamelo tres días antes a las 9')).toMatchObject({
      title: 'renovar el seguro',
      date: '2026-09-30',
      time: null,
      reminders: [at('2026-09-27', '09:00')],
    })
    expect(parse('excursión el domingo a las 8:00, avísame la víspera a las 21:00')).toMatchObject({
      date: '2026-09-13',
      time: '08:00',
      reminders: [at('2026-09-12', '21:00')],
    })
  })

  test('aviso en una franja del día', () => {
    expect(parse('recoger a Leo el lunes a las 17, recuérdamelo por la mañana').reminders).toEqual([at('2026-09-14', '09:00')])
    expect(parse('ITV el martes a las 10, avísame el día anterior por la tarde').reminders).toEqual([at('2026-09-14', '18:00')])
    expect(parse('cumpleaños de Sara el domingo, recuérdamelo el sábado por la noche')).toMatchObject({
      title: 'cumpleaños de Sara',
      date: '2026-09-13',
      reminders: [at('2026-09-12', '21:00')],
    })
  })

  test('varios avisos a hora concreta seguidos', () => {
    expect(parse('médico el martes a las 12, avísame media hora antes y a las 9').reminders).toEqual([
      before(30),
      at('2026-09-15', '09:00'),
    ])
    expect(parse('tren mañana a las 7:00, avísame a las 6:15 y otra vez a las 6:40').reminders).toEqual([
      at('2026-09-12', '06:15'),
      at('2026-09-12', '06:40'),
    ])
  })

  test('"otra vez" sin un aviso delante no es un aviso', () => {
    expect(parse('llamar a Juan otra vez a las 17')).toMatchObject({ time: '17:00', reminders: [before(0)] })
  })

  test('un aviso "días antes" sin día de tarea se descarta', () => {
    expect(parse('pagar la cuota, avísame el día antes a las 9').reminders).toEqual([])
  })

  test.each([
    ['pagar la comunidad el día 5', '2026-10-05'],
    ['dentista el 20 a las 10', '2026-09-20'],
    ['entregar el trabajo antes del día 15', '2026-09-15'],
    ['boda el sábado 3 a las 13:00', '2026-10-03'],
    ['la semana que viene, el miércoles, dentista', '2026-09-16'],
    ['dentista el viernes 25 de septiembre', '2026-09-25'],
  ])('día: «%s» → %s', (input, date) => {
    expect(parse(input).date).toBe(date)
    expect(parse(input).title).toMatch(/^(pagar la comunidad|dentista|entregar el trabajo|boda)$/)
  })

  test('un número detrás de "el" que no es un día se queda en el título', () => {
    expect(parse('aparcar en el 5')).toEqual(literal('aparcar en el 5'))
    expect(parse('pagar el 5, mañana').title).toBe('pagar el 5')
    expect(parse('pagar el 5, mañana').date).toBe('2026-09-12')
  })

  test('el número junto a un día de la semana tiene que caer en ese día', () => {
    // El 3 de octubre de 2026 es sábado; el 2, viernes.
    expect(parse('entradas el sábado 2')).toMatchObject({ title: 'entradas 2', date: '2026-09-12' })
    expect(parse('boda el sábado 3').date).toBe('2026-10-03')
    // El próximo jueves 1 es el de octubre de 2026.
    expect(parse('revisión el jueves 1').date).toBe('2026-10-01')
  })

  test('"la semana que viene" mueve el día de la semana a la siguiente', () => {
    const monday = toInstant('2026-09-14', '10:00')
    expect(parse('dentista el martes', monday).date).toBe('2026-09-15')
    expect(parse('dentista el martes de la semana que viene', monday).date).toBe('2026-09-22')
  })

  test.each([
    ['cena a las 21.30', '21:30'],
    ['enviar el informe antes de las 12', '12:00'],
    ['comida a las 12 del mediodía', '12:00'],
    ['comida a la una del mediodía', '13:00'],
    ['cena esta noche a las diez', '22:00'],
    ['correr mañana a primera hora', '08:00'],
    ['vuelo a las 12 de la noche', '00:00'],
  ])('hora: «%s» → %s', (input, time) => {
    expect(parse(input).time).toBe(time)
  })

  test('un número con punto sin "a las" no es una hora', () => {
    expect(parse('pagar 12.50 de pan')).toEqual(literal('pagar 12.50 de pan'))
  })

  test('muletillas y verbos de ir alrededor de la fecha', () => {
    expect(parseSpoken('Vale, apunta que el lunes tengo la ITV.', NOW).title).toBe('ITV')
    expect(parseSpoken('He quedado con Iván para jugar al pádel el jueves a las 19:00.', NOW)).toMatchObject({
      title: 'Jugar al pádel con Iván',
      date: '2026-09-17',
      time: '19:00',
    })
  })
})

function literal(title: string) {
  return { title, date: null, time: null, reminders: [], label: null }
}

describe('parseSpoken', () => {
  test('sin fecha también limpia muletilla y punto final', () => {
    expect(parseSpoken('Recuérdame comprar leche.', NOW)).toEqual(literal('Comprar leche'))
    expect(parseSpoken('  Comprar pilas. ', NOW).title).toBe('Comprar pilas')
  })

  test('con fecha se comporta como parseTask', () => {
    const text = 'Llamar a Miguel hoy a las 17:00 y recordarlo 10 minutos antes.'
    expect(parseSpoken(text, NOW)).toEqual(parseTask(text, NOW))
  })
})
