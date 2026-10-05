import { describe, expect, test } from 'vitest'
import type { Place } from '../types'
import { normalizeState } from './backup'
import { toInstant } from './date'
import { draftsFromInterpreted } from './interpret'
import { parseSpoken, parseTask } from './parse'
import { MAX_ALIASES, cleanAliases, findPlace, matchPlace, nameTaken, placeKeys } from './places'
import { emptyState, reducer } from '../state/reducer'

// Viernes 11 de septiembre de 2026, 10:00 hora local.
const NOW = toInstant('2026-09-11', '10:00')

const place = (id: string, name: string, aliases: string[] = []): Place => ({
  id,
  name,
  aliases,
  location: { lat: 39.47, lng: -0.38, address: '' },
  radius: 150,
})

const PLACES = [
  place('c', 'Casa', ['el piso', 'casa de mis padres']),
  place('m', 'Mercadona', ['súper']),
  place('cf', 'Carrefour'),
  place('g', 'Gimnasio'),
]

describe('otros nombres', () => {
  test('se encuentra el lugar por cualquiera de ellos, sin artículo ni tildes', () => {
    expect(findPlace(PLACES, 'Piso')?.id).toBe('c')
    expect(findPlace(PLACES, 'la casa de mis padres')?.id).toBe('c')
    expect(findPlace(PLACES, 'el super')?.id).toBe('m')
    expect(findPlace(PLACES, 'oficina')).toBeNull()
  })

  test('todas las formas de nombrarlos, las largas primero', () => {
    expect(placeKeys(PLACES)[0]).toBe('casa de mis padres')
    expect(placeKeys(PLACES)).toContain('piso')
  })

  test('saneados: sin vacíos, repetidos, el propio nombre ni los de otros lugares', () => {
    const others = [place('m', 'Mercadona', ['súper'])]
    expect(cleanAliases(['  piso ', 'Piso', '', 'casa', 'Súper', 'mercadona', 42, 'el chalet'], 'Casa', others)).toEqual(['piso', 'el chalet'])
    expect(cleanAliases(Array.from({ length: 12 }, (_, index) => `sitio ${index}`), 'Casa', [])).toHaveLength(MAX_ALIASES)
  })

  test('un nombre está cogido si otro lugar se llama así de nombre o de otro nombre', () => {
    expect(nameTaken(PLACES, 'súper')).toBe(true)
    expect(nameTaken(PLACES, 'súper', 'm')).toBe(false)
    expect(nameTaken(PLACES, 'oficina')).toBe(false)
  })
})

describe('lo dictado con otra grafía', () => {
  test('una letra cambiada, de más o de menos se entiende como el guardado', () => {
    expect(matchPlace(PLACES, 'Carrefur')?.id).toBe('cf')
    expect(matchPlace(PLACES, 'Mercadonna')?.id).toBe('m')
    expect(matchPlace(PLACES, 'Gimansio')?.id).toBe('g')
  })

  test('los nombres cortos solo valen tal cual, y lo muy distinto es un lugar nuevo', () => {
    expect(matchPlace(PLACES, 'cosa')).toBeNull()
    expect(matchPlace(PLACES, 'Lidl')).toBeNull()
    expect(matchPlace(PLACES, 'Mercado central')).toBeNull()
  })

  test('los números no se parecen: «Piso 2» no es «Piso 1»', () => {
    expect(matchPlace([place('p', 'Piso 1')], 'Piso 2')).toBeNull()
    expect(matchPlace([place('p', 'Parking 12')], 'Parkin 12')?.id).toBe('p')
  })

  test('si dos se parecen igual, ninguno', () => {
    expect(matchPlace([place('a', 'Farmacia'), place('b', 'Farmacio')], 'Farmacie')).toBeNull()
  })
})

describe('al escribir o dictar', () => {
  test('«al llegar al piso» avisa al llegar a Casa', () => {
    expect(parseTask('regar las plantas al llegar al piso', NOW, PLACES)).toMatchObject({
      title: 'regar las plantas',
      reminders: [{ kind: 'place', placeId: 'c', on: 'arrive' }],
      label: 'Al llegar a Casa',
    })
  })

  test('un otro nombre de varias palabras', () => {
    expect(parseTask('llevar el táper cuando salga de casa de mis padres', NOW, PLACES)).toMatchObject({
      title: 'llevar el táper',
      reminders: [{ kind: 'place', placeId: 'c', on: 'leave' }],
    })
  })

  test('un lugar dicho con una letra de menos es el guardado, no uno nuevo', () => {
    const parsed = parseSpoken('comprar leche al pasar por Carrefur', NOW, PLACES)
    expect(parsed.reminders).toEqual([{ kind: 'place', placeId: 'cf', on: 'arrive' }])
    expect(parsed.newPlace).toBeUndefined()
  })

  test('lo que devuelve la IA se empareja también por otro nombre y con otra grafía', () => {
    const raw = [
      { title: 'Regar', place: { name: 'el piso', on: 'arrive' } },
      { title: 'Leche', place: { name: 'Carrefur', on: 'arrive' } },
    ]
    const drafts = draftsFromInterpreted(raw, NOW, PLACES)
    expect(drafts?.map((draft) => draft.reminders)).toEqual([
      [{ kind: 'place', placeId: 'c', on: 'arrive' }],
      [{ kind: 'place', placeId: 'cf', on: 'arrive' }],
    ])
  })
})

describe('la IA y los plazos', () => {
  test('con una sola tarea, el plazo dicho lo pone el analizador del móvil', () => {
    const [draft] = draftsFromInterpreted([{ title: 'Llamar al banco', date: '2026-09-11' }], NOW, [], 'esta semana tengo que llamar al banco') ?? []
    expect(draft).toMatchObject({ title: 'Llamar al banco', date: '2026-09-11', until: '2026-09-13', label: 'Esta semana' })
  })

  test('sin plazo en lo dicho, o con varias tareas, manda la IA', () => {
    const [single] = draftsFromInterpreted([{ title: 'Cena', date: '2026-09-12' }], NOW, [], 'mañana cena') ?? []
    expect(single?.until).toBeUndefined()
    const many = draftsFromInterpreted([{ title: 'A', date: '2026-09-12' }, { title: 'B' }], NOW, [], 'esta semana A y B') ?? []
    expect(many.every((draft) => draft.until === undefined)).toBe(true)
  })
})

describe('guardar y cargar', () => {
  test('el reducer descarta los otros nombres que chocan con otro lugar', () => {
    let state = reducer(emptyState(), { type: 'place/add', id: 'm', name: 'Mercadona', aliases: ['súper'] })
    state = reducer(state, { type: 'place/add', id: 'c', name: 'Casa', aliases: ['piso', 'super', 'mercadona'] })
    expect(state.places.find((item) => item.id === 'c')?.aliases).toEqual(['piso'])
    state = reducer(state, { type: 'place/update', id: 'c', aliases: ['piso', 'chalet'] })
    expect(state.places.find((item) => item.id === 'c')?.aliases).toEqual(['piso', 'chalet'])
    // Un lugar nuevo no puede llamarse como el otro nombre de otro.
    expect(reducer(state, { type: 'place/add', id: 'x', name: 'Chalet' })).toBe(state)
  })

  test('las copias antiguas no traen otros nombres; los que chocan se quitan', () => {
    const loaded = normalizeState({
      tasks: [{ id: 't', title: 'x', date: '2026-09-11', until: '2026-09-13' }],
      sections: [],
      places: [
        { id: 'a', name: 'Casa', aliases: ['piso', 'Gimnasio', 'piso'] },
        { id: 'b', name: 'Gimnasio', aliases: ['piso'] },
        { id: 'c', name: 'Oficina' },
      ],
    })
    expect(loaded?.places.map((item) => item.aliases)).toEqual([['piso'], [], []])
    expect(loaded?.tasks[0]?.until).toBe('2026-09-13')
  })
})
