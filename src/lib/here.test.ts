import { afterEach, beforeAll, describe, expect, test } from 'vitest'
import { emptyState, reducer } from '../state/reducer'
import type { AppState, Place, Task } from '../types'
import { toInstant } from './date'
import { setLanguage } from './i18n'
import { draftsFromInterpreted } from './interpret'
import { TASK_CATEGORY, nativePlan } from './nativeSchedule'
import { parseSpoken, parseTask, provideEnglish } from './parse'
import * as englishParser from './parseEn'
import { HERE_TTL_MS, MAX_HERE_ALERTS, placeAlerts, placeTriggerOf } from './places'
import { DEFAULT_HERE_RADIUS, MIN_HERE_RADIUS, normalizeReminder, reminderIssue, reminderLabel, sameReminder } from './reminders'

// Viernes 11 de septiembre de 2026, 10:00 hora local.
const TODAY = '2026-09-11'
const NOW = toInstant(TODAY, '10:00')

const place = (id: string, name: string): Place => ({ id, name, aliases: [], location: { lat: 39.47, lng: -0.38, address: '' }, radius: 150 })
const PLACES = [place('c', 'Casa'), place('m', 'Mercadona')]

const task = (partial: Partial<Task> & { id: string }): Task => ({
  title: partial.id,
  done: false,
  date: TODAY,
  until: null,
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

const HERE = { kind: 'here', radius: DEFAULT_HERE_RADIUS, from: null, since: NOW } as const
const pinned = { lat: 39.5, lng: -0.4 }

afterEach(() => setLanguage('es'))

describe('escribir "al moverme"', () => {
  test('el ejemplo del usuario: la petición queda en el título y el aviso es al alejarse', () => {
    expect(parseSpoken('al moverme recuérdame que llame a Raúl', NOW, PLACES)).toMatchObject({
      title: 'Llamar a Raúl',
      date: null,
      time: null,
      reminders: [HERE],
      label: 'Al alejarme 100 m',
    })
  })

  test.each([
    'llamar a Raúl cuando me mueva',
    'llamar a Raúl en cuanto me mueva de aquí',
    'llamar a Raúl al alejarme',
    'llamar a Raúl cuando me aleje de aquí',
    'llamar a Raúl cuando me vaya de aquí',
    'llamar a Raúl al salir de aquí',
    'llamar a Raúl al irme de donde estoy',
  ])('«%s» avisa al alejarse', (text) => {
    expect(parseTask(text, NOW, PLACES)).toMatchObject({ title: 'llamar a Raúl', reminders: [HERE] })
  })

  test('con el radio dicho (acotado por abajo)', () => {
    expect(parseTask('sacar la basura al alejarme más de 30 metros', NOW, PLACES)).toMatchObject({
      title: 'sacar la basura',
      reminders: [{ kind: 'here', radius: 30, from: null, since: NOW }],
      label: 'Al alejarme 30 m',
    })
    expect(parseTask('llamar a Raúl cuando me mueva 200 m', NOW, PLACES).reminders).toEqual([{ kind: 'here', radius: 200, from: null, since: NOW }])
    expect(parseTask('llamar a Raúl cuando me mueva 10 m', NOW, PLACES).reminders).toEqual([{ kind: 'here', radius: MIN_HERE_RADIUS, from: null, since: NOW }])
  })

  test('irse o alejarse de un lugar guardado sigue siendo ese lugar, no "aquí"', () => {
    expect(parseTask('coger las llaves cuando me vaya de casa', NOW, PLACES).reminders).toEqual([{ kind: 'place', placeId: 'c', on: 'leave' }])
    expect(parseTask('llamar a Raúl cuando me aleje de casa', NOW, PLACES)).toMatchObject({
      title: 'llamar a Raúl',
      reminders: [{ kind: 'place', placeId: 'c', on: 'leave' }],
    })
    // Alejarse de un sitio sin guardar tampoco es "aquí": se queda tal cual.
    expect(parseTask('llamar a Raúl al alejarme de la oficina', NOW, PLACES).reminders.some((r) => r.kind === 'here')).toBe(false)
    // "Aquí" nunca es un lugar nuevo.
    expect(parseTask('cuando me vaya de aquí llamar a Raúl', NOW, PLACES)).toMatchObject({ reminders: [HERE] })
    expect(parseTask('cuando me vaya de aquí llamar a Raúl', NOW, PLACES).newPlace).toBeUndefined()
  })

  test('el "que" que sigue va con el tramo: el título queda en infinitivo', () => {
    expect(parseSpoken('recuérdame al salir de aquí que llame a Raúl', NOW, PLACES)).toMatchObject({ title: 'Llamar a Raúl', reminders: [HERE] })
    expect(parseSpoken('avísame al moverme de que apague la luz', NOW, PLACES)).toMatchObject({ title: 'Apagar la luz', reminders: [HERE] })
  })

  test('con hora no se añade el aviso "a la hora": ya hay uno', () => {
    expect(parseTask('llamar a Raúl a las 5 al moverme', NOW, PLACES).reminders).toEqual([HERE])
  })

  test('en la PWA (sin lugares) se queda tal cual', () => {
    expect(parseTask('llamar a Raúl al moverme', NOW, null)).toMatchObject({ title: 'llamar a Raúl al moverme', reminders: [], label: null })
  })
})

describe('"when I move" (inglés)', () => {
  beforeAll(() => provideEnglish(englishParser))

  test.each(['call Raúl when I move', 'call Raúl once I move away', 'call Raúl when I leave here', 'call Raúl when I head out', 'call Raúl as soon as I walk away from here'])(
    '«%s» avisa al alejarse',
    (text) => {
      setLanguage('en')
      expect(parseTask(text, NOW, PLACES)).toMatchObject({ title: 'call Raúl', reminders: [HERE] })
    },
  )

  test('con radio, y nunca un sitio ni una mudanza', () => {
    setLanguage('en')
    expect(parseTask('call Raúl when I move more than 200 meters', NOW, PLACES).reminders).toEqual([{ kind: 'here', radius: 200, from: null, since: NOW }])
    for (const text of ['call mom when I move away from the office', 'when I move house update my address', 'remind me when I move out to cancel the internet', 'call mom when I head out of the gym']) {
      expect(parseTask(text, NOW, PLACES).reminders.some((r) => r.kind === 'here'), text).toBe(false)
    }
    // Un lugar guardado al salir sigue siendo ese lugar.
    expect(parseTask('call mom when I leave Casa', NOW, PLACES).reminders).toEqual([{ kind: 'place', placeId: 'c', on: 'leave' }])
  })
})

describe('la IA del dictado', () => {
  test('con una tarea pone el aviso del móvil y conserva un título que es una tarea de "mover"', () => {
    const raw = [{ title: 'Mover el coche', date: null, time: null, duration: null, reminders: [] }]
    const [draft] = draftsFromInterpreted(raw, NOW, PLACES, 'cuando me aleje recuérdame que mueva el coche')!
    expect(draft).toMatchObject({ title: 'Mover el coche', reminders: [HERE] })
    // Si la IA dejó la frase en el título, vale el del móvil.
    const literal = [{ title: 'Al moverme llamar a Raúl', date: null, time: null, duration: null, reminders: [] }]
    expect(draftsFromInterpreted(literal, NOW, PLACES, 'al moverme llamar a Raúl')![0]).toMatchObject({ title: 'Llamar a Raúl', reminders: [HERE] })
  })

  test('con varias tareas, un "lugar" llamado aquí al salir es alejarse, no un lugar nuevo', () => {
    const raw = [
      { title: 'Llamar a Raúl', date: null, time: null, duration: null, reminders: [], place: { name: 'aquí', on: 'leave' } },
      { title: 'Comprar pan', date: null, time: null, duration: null, reminders: [] },
    ]
    const drafts = draftsFromInterpreted(raw, NOW, PLACES, 'llamar a Raúl cuando me vaya de aquí y comprar pan')!
    expect(drafts[0]).toMatchObject({ title: 'Llamar a Raúl', reminders: [{ kind: 'here', radius: DEFAULT_HERE_RADIUS, from: null, since: NOW }] })
    expect(drafts[0]?.newPlace).toBeUndefined()
    expect(drafts[1]).toMatchObject({ title: 'Comprar pan', reminders: [] })
  })
})

describe('el aviso "al alejarme"', () => {
  test('etiqueta en los dos idiomas', () => {
    expect(reminderLabel(HERE, NOW)).toBe('Al alejarme 100 m')
    setLanguage('en')
    expect(reminderLabel({ ...HERE, radius: 50 }, NOW)).toBe('Once I’m 50 m away')
  })

  test('solo uno por tarea, da igual el radio', () => {
    expect(sameReminder(HERE, { kind: 'here', radius: 200, from: pinned, since: 0 })).toBe(true)
    expect(sameReminder(HERE, { kind: 'before', minutes: 0 })).toBe(false)
  })

  test('por qué no sonaría: fuera del iPhone, o sin punto', () => {
    const t = task({ id: 'a' })
    expect(reminderIssue(t, HERE, NOW, [], false)).toBe('phone-only')
    expect(reminderIssue(t, HERE, NOW, [], true)).toBe('no-place')
    expect(reminderIssue(t, { ...HERE, from: pinned }, NOW, [], true)).toBeNull()
  })

  test('saneado: el radio se acota, el punto se valida y la precisión se conserva', () => {
    expect(normalizeReminder({ id: 'x', kind: 'here', radius: 3, from: { lat: 39.47, lng: -0.38, accuracy: 42.6 }, since: 5 })).toEqual({
      id: 'x',
      kind: 'here',
      radius: MIN_HERE_RADIUS,
      from: { lat: 39.47, lng: -0.38, accuracy: 43 },
      since: 5,
    })
    expect(normalizeReminder({ id: 'x', kind: 'here', radius: 50, from: { lat: 999, lng: 0 } })).toMatchObject({ from: null, since: 0 })
    expect(normalizeReminder({ id: 'x', kind: 'here', radius: 'mucho' })).toBeNull()
  })

  test('en las filas cuenta como salir', () => {
    expect(placeTriggerOf({ reminders: [{ id: 'r', ...HERE }] })).toBe('leave')
    expect(placeTriggerOf({ reminders: [{ id: 'r', ...HERE }] }, 'c')).toBeNull()
  })
})

describe('la región de "al alejarme"', () => {
  test('una por aviso ubicado, con su tarea, da igual el día; sin punto o hecha, ninguna', () => {
    const tasks = [
      task({ id: 'raul', title: 'Llamar a Raúl', reminders: [{ id: 'r1', kind: 'here', radius: 50, from: pinned, since: NOW }] }),
      task({ id: 'sin-punto', reminders: [{ id: 'r2', ...HERE }] }),
      task({ id: 'hecha', done: true, reminders: [{ id: 'r3', kind: 'here', radius: 50, from: pinned, since: NOW }] }),
      task({ id: 'futura', date: '2026-09-12', reminders: [{ id: 'r4', kind: 'here', radius: 50, from: pinned, since: NOW - 1 }] }),
    ]
    expect(placeAlerts({ tasks, places: [] }, TODAY)).toEqual([
      { key: 'here:r1', placeId: 'here:r1', on: 'leave', lat: 39.5, lng: -0.4, radius: 50, title: 'Llamar a Raúl', body: 'Te has alejado 50 m', taskIds: ['raul'] },
      { key: 'here:r4', placeId: 'here:r4', on: 'leave', lat: 39.5, lng: -0.4, radius: 50, title: 'futura', body: 'Te has alejado 50 m', taskIds: ['futura'] },
    ])
  })

  test('la región crece con el error del GPS, y la píldora sigue diciendo el radio elegido', () => {
    const tasks = [task({ id: 'a', reminders: [{ id: 'r', kind: 'here', radius: 50, from: { ...pinned, accuracy: 65 }, since: NOW }] })]
    expect(placeAlerts({ tasks, places: [] }, TODAY)[0]).toMatchObject({ radius: 65, body: 'Te has alejado 50 m' })
  })

  test('caduca al día y van delante de los lugares; cinco como mucho', () => {
    const old = task({ id: 'viejo', reminders: [{ id: 'r0', kind: 'here', radius: 50, from: pinned, since: NOW - HERE_TTL_MS - 1 }] })
    const many = Array.from({ length: 7 }, (_, index) =>
      task({ id: `t${index}`, reminders: [{ id: `h${index}`, kind: 'here', radius: 50, from: pinned, since: NOW - index * 1000 }] }),
    )
    const placed = task({ id: 'pan', reminders: [{ id: 'p', kind: 'place', placeId: 'm', on: 'arrive' }] })
    const alerts = placeAlerts({ tasks: [old, placed, ...many], places: PLACES }, TODAY, NOW)
    expect(alerts.filter((alert) => alert.key.startsWith('here:'))).toHaveLength(MAX_HERE_ALERTS)
    expect(alerts.map((alert) => alert.key).slice(0, 2)).toEqual(['here:h0', 'here:h1'])
    expect(alerts.some((alert) => alert.key === 'here:r0')).toBe(false)
    expect(alerts.at(-1)?.key).toBe('m:arrive')
  })

  test('en el plan del iPhone lleva los botones de tarea', () => {
    const state: AppState = { ...emptyState(), tasks: [task({ id: 'raul', reminders: [{ id: 'r1', kind: 'here', radius: 50, from: pinned, since: NOW }] })] }
    const [alert] = nativePlan(state, NOW).places
    expect(alert).toMatchObject({ on: 'leave', radius: 50, category: TASK_CATEGORY, extra: { placeId: 'here:r1', on: 'leave', taskIds: 'raul' } })
  })
})

describe('reminder/here', () => {
  const start = reducer(emptyState(), { type: 'task/add', id: 't', title: 'Llamar a Raúl', date: null, sectionId: null, reminders: [HERE] })
  const reminderId = start.tasks[0]!.reminders[0]!.id

  test('fija el punto (y desde entonces cuenta la vida) y cambia el radio, acotado', () => {
    const later = NOW + 3 * 60 * 60_000
    const fixed = reducer(start, { type: 'reminder/here', taskId: 't', reminderId, from: { lat: 39.5, lng: -0.4, accuracy: 12 }, now: later })
    expect(fixed.tasks[0]!.reminders[0]).toMatchObject({ radius: DEFAULT_HERE_RADIUS, from: { lat: 39.5, lng: -0.4, accuracy: 12 }, since: later })
    const wider = reducer(fixed, { type: 'reminder/here', taskId: 't', reminderId, radius: 5000, now: later + 1 })
    expect(wider.tasks[0]!.reminders[0]).toMatchObject({ radius: 1000, from: { lat: 39.5, lng: -0.4, accuracy: 12 }, since: later })
  })

  test('un aviso de hace más de un día está caducado aunque tenga punto', () => {
    const t = task({ id: 'a' })
    expect(reminderIssue(t, { ...HERE, from: pinned, since: NOW - HERE_TTL_MS - 1 }, NOW, [], true)).toBe('past')
  })

  test('nada que cambiar, o un aviso que no es de estos: el mismo estado', () => {
    expect(reducer(start, { type: 'reminder/here', taskId: 't', reminderId, radius: DEFAULT_HERE_RADIUS })).toBe(start)
    expect(reducer(start, { type: 'reminder/here', taskId: 't', reminderId: 'otro', from: { lat: 1, lng: 1 } })).toBe(start)
  })
})
