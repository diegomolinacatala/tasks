import { describe, expect, test } from 'vitest'
import type { Place } from '../types'
import { addDays, toInstant } from './date'
import { parseSpoken, parseTask } from './parse'

// Viernes 11 de septiembre de 2026, 10:00 hora local.
const TODAY = '2026-09-11'
const NOW = toInstant(TODAY, '10:00')

const place = (id: string, name: string): Place => ({
  id,
  name,
  location: { lat: 39.47, lng: -0.38, address: '' },
  radius: 150,
})

const PLACES = [place('m', 'Mercadona'), place('u', 'Universidad'), place('c', 'Casa'), place('ci', 'El Corte Inglés')]

describe('lugares guardados', () => {
  test('«al pasar por» crea un aviso al llegar y lo quita del título', () => {
    expect(parseTask('comprar pan al pasar por mercadona', NOW, PLACES)).toEqual({
      title: 'comprar pan',
      date: null,
      time: null,
      reminders: [{ kind: 'place', placeId: 'm', on: 'arrive' }],
      label: 'Al llegar a Mercadona',
    })
  })

  test('el ejemplo dictado: petición, lugar y tarea después', () => {
    expect(parseSpoken('Recuérdame al pasar por Mercadona de comprar pan', NOW, PLACES)).toMatchObject({
      title: 'Comprar pan',
      reminders: [{ kind: 'place', placeId: 'm', on: 'arrive' }],
    })
    expect(parseSpoken('Recuérdame al llegar a la universidad que tengo que reunirme con José', NOW, PLACES)).toMatchObject({
      title: 'Reunirme con José',
      reminders: [{ kind: 'place', placeId: 'u', on: 'arrive' }],
    })
  })

  test('«al salir de» avisa al salir', () => {
    expect(parseTask('al salir de casa coger las llaves', NOW, PLACES)).toMatchObject({
      title: 'coger las llaves',
      reminders: [{ kind: 'place', placeId: 'c', on: 'leave' }],
      label: 'Al salir de Casa',
    })
    expect(parseTask('coger el paraguas cuando salga de casa', NOW, PLACES).reminders).toEqual([
      { kind: 'place', placeId: 'c', on: 'leave' },
    ])
  })

  test.each([
    'cuando llegue a la universidad ver a José',
    'en cuanto llegue a la universidad ver a José',
    'nada más llegar a la universidad ver a José',
    'cuando esté en la universidad ver a José',
  ])('«%s» también es al llegar', (text) => {
    expect(parseTask(text, NOW, PLACES)).toMatchObject({
      title: 'ver a José',
      reminders: [{ kind: 'place', placeId: 'u', on: 'arrive' }],
    })
  })

  test('nombres de varias palabras y con artículo propio', () => {
    expect(parseTask('mirar zapatillas cuando pase por el corte ingles', NOW, PLACES)).toMatchObject({
      title: 'mirar zapatillas',
      reminders: [{ kind: 'place', placeId: 'ci', on: 'arrive' }],
    })
  })

  test('se combina con el día: el aviso de lugar espera a que llegue ese día', () => {
    expect(parseTask('mañana al llegar a la universidad hablar con José', NOW, PLACES)).toMatchObject({
      title: 'hablar con José',
      date: addDays(TODAY, 1),
      reminders: [{ kind: 'place', placeId: 'u', on: 'arrive' }],
      label: 'Mañana · Al llegar a Universidad',
    })
  })

  test('con hora y lugar no se añade además el aviso «a la hora»', () => {
    expect(parseTask('mañana a las 10 al llegar a mercadona comprar pan', NOW, PLACES).reminders).toEqual([
      { kind: 'place', placeId: 'm', on: 'arrive' },
    ])
  })
})

describe('lugares nuevos', () => {
  test('un nombre que aún no está guardado se propone para crearlo', () => {
    expect(parseSpoken('Recuérdame al pasar por Mercadona de comprar pan', NOW)).toEqual({
      title: 'Comprar pan',
      date: null,
      time: null,
      reminders: [],
      label: 'Al llegar a Mercadona',
      newPlace: { name: 'Mercadona', on: 'arrive' },
    })
  })

  test('toma las palabras en mayúscula que siguen, con su artículo', () => {
    expect(parseSpoken('Cuando llegue a El Corte Inglés mirar zapatillas', NOW).newPlace).toEqual({
      name: 'El Corte Inglés',
      on: 'arrive',
    })
  })

  test('en minúsculas se queda con una palabra y la pone en mayúscula', () => {
    expect(parseTask('cuando pase por el banco sacar dinero', NOW)).toMatchObject({
      title: 'sacar dinero',
      newPlace: { name: 'Banco', on: 'arrive' },
    })
  })

  test('«de» solo es conector si le sigue un verbo: «casa de Pepe» no se parte', () => {
    expect(parseTask('al salir del gimnasio de estirar', NOW)).toMatchObject({
      title: 'estirar',
      newPlace: { name: 'Gimnasio', on: 'leave' },
    })
  })
})

describe('sin lugares en esta plataforma', () => {
  test('con `null` no se buscan lugares: la frase queda como estaba', () => {
    expect(parseTask('comprar pan al pasar por mercadona', NOW, null)).toEqual({
      title: 'comprar pan al pasar por mercadona',
      date: null,
      time: null,
      reminders: [],
      label: null,
    })
    expect(parseTask('mañana al pasar por mercadona', NOW, null).title).toBe('al pasar por mercadona')
  })
})

describe('sin lugar', () => {
  test.each(['llegar a casa pronto', 'pasar por el taller', 'al pasar la ITV', 'salir de dudas'])('«%s» no tiene aviso de lugar', (text) => {
    const parsed = parseTask(text, NOW, PLACES)
    expect(parsed.reminders).toEqual([])
    expect(parsed.newPlace).toBeUndefined()
  })
})
