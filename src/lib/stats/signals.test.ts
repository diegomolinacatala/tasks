import { afterEach, describe, expect, test, vi } from 'vitest'
import type { Action } from '../../state/actions'
import type { InboxEntry } from '../inbox'
import { attach, setCollecting, track, trackAction, type StatsSignal } from './bus'
import { bootBucket, hourBucket, latencyBucket, sessionBucket } from './buckets'
import { errorSignature } from './errors'
import { actionEvents, inboxEvents } from './events'
import { emptyLedger, fullFor, parseLedger, sizeOf, usageFor } from './ledger'
import { effectiveLevel, normalizeStatsSettings, shouldAskStats } from './settings'
import { GRID_COLS, cellOf, rageAfter, targetOf } from './taps'

const context = { cohort: null, lang: 'es' as const, theme: 'auto' as const, size: 'm' as const }

describe('qué cuenta cada acción', () => {
  test('el tipo y, al crear una tarea, la forma que trae (nunca su contenido)', () => {
    const add: Action = {
      type: 'task/add',
      title: 'Cena con Carlota',
      date: '2026-11-05',
      sectionId: null,
      time: '21:00',
      reminders: [{ kind: 'before', minutes: 30 }, { kind: 'before', minutes: 10 }, { kind: 'place', placeId: 'p', on: 'arrive' }],
    }
    const names = actionEvents(add)
    expect(names).toEqual(['task/add', 'task/add+date', 'task/add+time', 'task/add+before', 'task/add+place'])
    expect(names.join(' ')).not.toContain('Carlota')
    expect(actionEvents({ type: 'task/add', title: 'Pan', date: null, sectionId: null })).toEqual(['task/add'])
    expect(actionEvents({ type: 'task/toggle', id: 'x' })).toEqual(['task/toggle'])
    expect(actionEvents({ type: 'state/replace', state: {} as never })).toEqual([])
  })

  test('lo que llega de Siri, Atajos o un aviso, por clase', () => {
    const base = { id: 'e', createdAt: 0, places: [], tasks: [] }
    const entries = [
      { ...base, tasks: [{ title: 'x' }] },
      { ...base, text: 'comprar pan' },
      { ...base, move: { date: '2026-11-05', taskIds: ['a'] } },
      { ...base, ask: { taskId: 'a', reply: 'done' } },
      base,
    ] as unknown as InboxEntry[]
    expect(inboxEvents(entries)).toEqual(['inbox/add', 'inbox/add', 'inbox/move', 'inbox/ask'])
  })
})

describe('el ping del día', () => {
  test('la primera vez: día, semana, mes y primera, con la cohorte en el lunes', () => {
    const { ledger, usage } = usageFor(emptyLedger(), '2026-11-05', context)
    expect(usage).toMatchObject({ weekly: true, monthly: true, first: true, cohort: '2026-11-02', active28: 1 })
    expect(ledger).toEqual({ lastDay: '2026-11-05', days: ['2026-11-05'], fullDay: null })
    expect(usageFor(ledger, '2026-11-05', context).usage).toBeNull()
  })

  test('otro día de la misma semana y mes no vuelve a contar semana ni mes', () => {
    const start = usageFor(emptyLedger(), '2026-11-02', { ...context, cohort: '2026-10-26' })
    const next = usageFor(start.ledger, '2026-11-05', { ...context, cohort: '2026-10-26' })
    expect(next.usage).toMatchObject({ weekly: false, monthly: false, first: false, cohort: '2026-10-26', active28: 2 })
    const december = usageFor(next.ledger, '2026-12-01', { ...context, cohort: '2026-10-26' })
    // El 2 de noviembre ya queda fuera de las 4 semanas; el 5, no.
    expect(december.usage).toMatchObject({ weekly: true, monthly: true, active28: 2 })
  })

  test('"comparte el detalle" se cuenta una vez al día, y la semana, la primera vez', () => {
    const monday = fullFor(emptyLedger(), '2026-11-02')
    expect(monday?.weekly).toBe(true)
    expect(fullFor(monday!.ledger, '2026-11-02')).toBeNull()
    expect(fullFor(monday!.ledger, '2026-11-05')?.weekly).toBe(false)
    expect(fullFor(monday!.ledger, '2026-11-09')?.weekly).toBe(true)
  })

  test('un reloj que va hacia atrás no cuenta dos veces', () => {
    const { ledger } = usageFor(emptyLedger(), '2026-11-05', context)
    expect(usageFor(ledger, '2026-11-04', context)).toEqual({ ledger, usage: null })
  })

  test('lo guardado se sanea y olvida lo de hace más de 4 semanas', () => {
    expect(parseLedger({ lastDay: '2026-11-04', days: ['2026-09-01', '2026-11-01', 'ayer', 3], fullDay: 'x' }, '2026-11-05')).toEqual({
      lastDay: '2026-11-04',
      days: ['2026-11-01'],
      fullDay: null,
    })
    expect(parseLedger('roto', '2026-11-05')).toEqual(emptyLedger())
    expect([sizeOf(667), sizeOf(844), sizeOf(932)]).toEqual(['s', 'm', 'l'])
  })
})

describe('el mapa de calor', () => {
  test('la celda de un toque en la rejilla de 16 × 32', () => {
    expect(cellOf(0, 0, 390, 844)).toBe(0)
    expect(cellOf(389, 843, 390, 844)).toBe(32 * GRID_COLS - 1)
    expect(cellOf(195, 422, 390, 844)).toBe(16 * GRID_COLS + 8)
    expect(cellOf(-1, 10, 390, 844)).toBeNull()
    expect(cellOf(10, 10, 0, 844)).toBeNull()
  })

  test('el objetivo sale solo de las clases: sin estados, modificadores ni nada raro', () => {
    expect(targetOf(['is-open', 'chip--on', 'chip'])).toBe('chip')
    expect(targetOf(['composer__send'])).toBe('composer__send')
    expect(targetOf(['has-sheet', 'Cena con Carlota'])).toBeNull()
    expect(targetOf([])).toBeNull()
  })

  test('rabia: el tercer toque seguido en el mismo sitio', () => {
    const one = rageAfter([], { x: 100, y: 100, at: 0 })
    const two = rageAfter(one.recent, { x: 104, y: 98, at: 300 })
    const three = rageAfter(two.recent, { x: 101, y: 103, at: 600 })
    expect([one.rage, two.rage, three.rage]).toEqual([false, false, true])
    expect(rageAfter(two.recent, { x: 300, y: 100, at: 600 }).rage).toBe(false)
    expect(rageAfter(two.recent, { x: 100, y: 100, at: 1500 }).rage).toBe(false)
  })
})

describe('tramos, errores y ajustes', () => {
  test('cada cifra cae en su tramo', () => {
    expect([bootBucket(120), bootBucket(450), bootBucket(9000)]).toEqual(['300', '600', 'inf'])
    expect([latencyBucket(16), latencyBucket(260)]).toEqual(['50', '500'])
    expect([sessionBucket(5), sessionBucket(45), sessionBucket(3600)]).toEqual(['10', '60', 'inf'])
    expect(hourBucket(new Date(2026, 10, 5, 8, 59))).toBe('08')
  })

  test('la firma de un error nunca lleva su mensaje', () => {
    const error = new SyntaxError('JSON Parse error: Unexpected identifier "Cena con Carlota"')
    error.stack = 'parse@capacitor://localhost/assets/index-3f2a.js:1:2345\nglobal code@capacitor://localhost/'
    expect(errorSignature(error)).toBe('SyntaxError@index-3f2a.js:1:2345')
    expect(errorSignature('texto suelto')).toBe('string')
    const odd = new Error('x')
    odd.name = '<b>raro</b>'
    odd.stack = ''
    expect(errorSignature(odd)).toBe('Error')
  })

  test('sin elegir, se mide la audiencia y se pregunta una vez', () => {
    const fresh = normalizeStatsSettings(undefined)
    expect(fresh).toEqual({ level: null, cohort: null })
    expect(effectiveLevel(fresh)).toBe('basic')
    expect(shouldAskStats(fresh)).toBe(true)
    expect(normalizeStatsSettings({ level: 'full', cohort: '2026-11-02' })).toEqual({ level: 'full', cohort: '2026-11-02' })
    expect(normalizeStatsSettings({ level: 'todo', cohort: 'ayer' })).toEqual({ level: null, cohort: null })
    expect(shouldAskStats({ level: 'off', cohort: null })).toBe(false)
  })
})

describe('la cola del JS principal', () => {
  afterEach(() => setCollecting(true))

  test('guarda lo que pasa hasta que se engancha el recolector, y nada si están apagadas', () => {
    track('view/agenda')
    trackAction({ type: 'task/toggle', id: 'x' })
    const seen: StatsSignal[] = []
    const detach = attach((signal) => seen.push(signal))
    // La acción llega ya como su nombre: la cola nunca guarda su contenido.
    expect(seen).toEqual([
      { kind: 'event', name: 'view/agenda', n: 1 },
      { kind: 'event', name: 'task/toggle', n: 1 },
    ])
    track('view/inbox')
    expect(seen).toHaveLength(3)
    detach()
    setCollecting(false)
    track('view/places')
    const later = vi.fn()
    attach(later)
    expect(later).not.toHaveBeenCalled()
  })
})
