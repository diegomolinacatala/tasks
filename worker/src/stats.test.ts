import { describe, expect, test } from 'vitest'
import { handle } from './app'
import {
  GRID_CELLS,
  MAX_STATS_ROWS,
  STATS_DAILY_ROWS,
  STATS_IP_DAILY_ROWS,
  STATS_KEEP_DAYS,
  cohortsFrom,
  dayIndex,
  dayOf,
  mondayIndex,
  parseRange,
  parseStats,
  previousRange,
  statsCutoff,
  weekRange,
} from './stats'
import { FEEDBACK_KEY, countingLimiter, testDeps } from './testing'
import type { CountRow, Deps } from './types'

const ORIGIN = 'https://diegomolinacatala.github.io'
const API = 'https://tasks-push.example.workers.dev'
// testDeps empieza el jueves 11/09/2026 a las 8:00 UTC.
const TODAY = '2026-09-11'
const MONDAY = '2026-09-07'

const usage = (overrides: Record<string, unknown> = {}) => ({
  weekly: true,
  monthly: false,
  first: true,
  cohort: MONDAY,
  active28: 3,
  lang: 'es',
  theme: 'auto',
  size: 'm',
  ...overrides,
})

const batch = (overrides: Record<string, unknown> = {}) => ({
  v: 1,
  platform: 'ios',
  version: '1.9',
  days: [
    {
      day: TODAY,
      usage: usage(),
      full: { weekly: true },
      events: { 'view/agenda': 4, 'task/add': 2, 'task/add+time': 1 },
      reach: ['view/agenda', 'task/add', 'task/add+time'],
      dist: { boot: { '600': 1 }, sess: { '30': 2 } },
      errors: { 'TypeError@index.js:1:200': 1 },
    },
  ],
  weeks: [
    {
      week: MONDAY,
      cells: [
        ['agenda', 500, 3, 1, 0],
        ['agenda', 12, 1, 0, 1],
      ],
      targets: [['agenda', 'composer__send', 3, 1, 0, 1]],
    },
  ],
  ...overrides,
})

const byName = (rows: CountRow[]) => Object.fromEntries(rows.map((r) => [r.name, r]))

function request(method: string, path: string, { body, key, origin = ORIGIN, ip = '1.2.3.4' }: Record<string, unknown> = {}) {
  const headers = new Headers({ 'cf-connecting-ip': String(ip) })
  if (origin) headers.set('origin', String(origin))
  if (key) headers.set('authorization', `Bearer ${String(key)}`)
  if (body !== undefined) headers.set('content-type', 'application/json')
  return new Request(`${API}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) })
}

const post = (deps: Deps, body: unknown = batch(), ip?: string) => handle(request('POST', '/v1/stats', { body, ip }), deps)

describe('fechas', () => {
  test('el lunes de cada semana y los periodos que pide el panel', () => {
    const thursday = dayIndex(TODAY) as number
    expect(dayOf(mondayIndex(thursday))).toBe(MONDAY)
    expect(dayOf(mondayIndex(dayIndex('2026-09-13') as number))).toBe(MONDAY)
    expect(dayOf(mondayIndex(dayIndex(MONDAY) as number))).toBe(MONDAY)
    expect(dayIndex('2026-02-30')).toBeNull()
    expect(previousRange({ from: '2026-09-01', to: '2026-09-30' })).toEqual({ from: '2026-08-02', to: '2026-08-31' })
    expect(cohortsFrom({ from: '2026-09-01', to: TODAY })).toBe('2026-06-22')
    expect(weekRange({ from: '2026-09-02', to: TODAY })).toEqual({ from: '2026-08-31', to: MONDAY })
    expect(statsCutoff(Date.UTC(2026, 8, 11))).toBe(dayOf((dayIndex(TODAY) as number) - STATS_KEEP_DAYS))
  })

  test('un periodo tiene que existir, ir hacia delante y no pasar de 400 días', () => {
    expect(parseRange(new URLSearchParams('from=2026-09-01&to=2026-09-30')).ok).toBe(true)
    expect(parseRange(new URLSearchParams('from=2026-09-30&to=2026-09-01')).ok).toBe(false)
    expect(parseRange(new URLSearchParams('from=2025-01-01&to=2026-09-30')).ok).toBe(false)
    expect(parseRange(new URLSearchParams('to=2026-09-30')).ok).toBe(false)
  })
})

describe('parseStats', () => {
  test('convierte el lote en contadores, sin nada que identifique al dispositivo', () => {
    const parsed = parseStats(batch(), TODAY)
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    const rows = byName(parsed.value.counts)
    expect(rows['u:day']).toMatchObject({ day: TODAY, platform: 'ios', version: '1.9', events: 1, devices: 1 })
    expect(rows['u:week']?.devices).toBe(1)
    expect(rows['u:full']?.devices).toBe(1)
    expect(rows['u:fullweek']?.devices).toBe(1)
    expect(rows['u:month']).toBeUndefined()
    // Lo que describe al dispositivo va sin plataforma ni versión: no se cruza con nada.
    for (const name of [`c:${MONDAY}`, 'u:first', 'd:active28:3', 'd:lang:es', 'd:theme:auto', 'd:size:m']) {
      expect(rows[name]).toMatchObject({ platform: '', version: '', devices: 1 })
    }
    expect(rows['e:task/add']).toMatchObject({ events: 2, devices: 1 })
    // Lo que cambia con cada versión va por versión; las sesiones, no.
    expect(rows['d:boot:600']).toMatchObject({ version: '1.9', events: 1, devices: 0 })
    expect(rows['d:sess:30']).toMatchObject({ version: '', events: 2 })
    expect(rows['x:TypeError@index.js:1:200']).toMatchObject({ events: 1, devices: 0 })
    expect(parsed.value.cells).toEqual([
      { week: MONDAY, version: '1.9', screen: 'agenda', cell: 500, taps: 3, rage: 1, dead: 0 },
      { week: MONDAY, version: '1.9', screen: 'agenda', cell: 12, taps: 1, rage: 0, dead: 1 },
    ])
    expect(parsed.value.targets).toEqual([
      { week: MONDAY, version: '1.9', screen: 'agenda', target: 'composer__send', taps: 3, rage: 1, dead: 0, slow: 1 },
    ])
  })

  test('un dispositivo cuenta una vez por día: solo lo que trae en `reach` suma dispositivos', () => {
    const later = batch({ days: [{ day: TODAY, events: { 'task/add': 3, 'view/bandeja': 1 }, reach: ['view/bandeja'] }], weeks: [] })
    const parsed = parseStats(later, TODAY)
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    const rows = byName(parsed.value.counts)
    expect(rows['u:day']).toBeUndefined()
    expect(rows['e:task/add']).toMatchObject({ events: 3, devices: 0 })
    expect(rows['e:view/bandeja']).toMatchObject({ events: 1, devices: 1 })
  })

  test('sin la semana del ping no hay dimensiones, y una cohorte que no es lunes no cuenta', () => {
    const parsed = parseStats(
      batch({ days: [{ day: TODAY, usage: usage({ weekly: false, monthly: true }) }] }),
      TODAY,
    )
    const names = parsed.ok ? parsed.value.counts.map((r) => r.name).sort() : []
    expect(names).toEqual(['u:day', 'u:first', 'u:month'])
    const tuesday = parseStats(batch({ days: [{ day: TODAY, usage: usage({ cohort: '2026-09-08' }) }] }), TODAY)
    expect(tuesday.ok && tuesday.value.counts.some((r) => r.name.startsWith('c:'))).toBe(false)
    const future = parseStats(batch({ days: [{ day: MONDAY, usage: usage({ cohort: '2026-09-14' }) }] }), TODAY)
    expect(future.ok && future.value.counts.some((r) => r.name.startsWith('c:'))).toBe(false)
  })

  test('suma lo repetido dentro del lote', () => {
    const twice = batch({
      days: [
        { day: TODAY, events: { 'task/add': 1 } },
        { day: TODAY, events: { 'task/add': 2 } },
      ],
      weeks: [{ week: MONDAY, cells: [['agenda', 1, 1, 0, 0], ['agenda', 1, 2, 1, 0]] }],
    })
    const parsed = parseStats(twice, TODAY)
    expect(parsed.ok && byName(parsed.value.counts)['e:task/add']?.events).toBe(3)
    expect(parsed.ok && parsed.value.cells).toEqual([{ week: MONDAY, version: '1.9', screen: 'agenda', cell: 1, taps: 3, rage: 1, dead: 0 }])
  })

  test('ignora lo que llega fuera de plazo y lo que no tiene la forma esperada', () => {
    const parsed = parseStats(
      batch({
        days: [
          { day: '2026-07-01', events: { 'task/add': 1 } },
          { day: '2026-09-13', events: { 'task/add': 1 } },
          {
            day: TODAY,
            events: { 'Task/Add': 1, 'task/add': 0, 'task/ok': 2.5, ['x'.repeat(80)]: 1, 'spam/whatever': 1, 'view/agenda': 1, 'task/setTime': 2 },
            dist: { boot: { '<script>': 1 }, 'BAD': { '1': 1 }, invented: { '1': 1 } },
            errors: { '<img src=x onerror="a">': 1 },
          },
        ],
        weeks: [
          {
            week: MONDAY,
            cells: [
              ['agenda', GRID_CELLS, 1, 0, 0],
              ['agenda', 3, 1, 2, 0],
              ['Agenda', 3, 1, 0, 0],
              ['agenda', 4, 1, 0, 0],
            ],
            targets: [['agenda', 'Composer', 1, 0, 0, 0], ['agenda', 'row__check', 1, 0, 0, 0]],
          },
        ],
      }),
      TODAY,
    )
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    // Los tipos de acción con mayúsculas (`task/setTime`) valen; las familias inventadas, no.
    expect(parsed.value.counts.map((r) => r.name)).toEqual(['e:view/agenda', 'e:task/setTime'])
    expect(parsed.value.cells.map((r) => r.cell)).toEqual([4])
    expect(parsed.value.targets.map((r) => r.target)).toEqual(['row__check'])
  })

  test('rechaza lotes de otra versión, plataforma o forma', () => {
    expect(parseStats(batch({ v: 2 }), TODAY).ok).toBe(false)
    expect(parseStats(batch({ platform: 'android' }), TODAY).ok).toBe(false)
    expect(parseStats(batch({ version: '1.9 (52)' }), TODAY).ok).toBe(false)
    expect(parseStats(batch({ days: 'hoy' }), TODAY).ok).toBe(false)
    expect(parseStats(batch({ days: [{ day: '11/09/2026' }] }), TODAY).ok).toBe(false)
    expect(parseStats(batch({ weeks: [{ week: TODAY }] }), TODAY).ok).toBe(false)
    // 1200 celdas distintas por semana (tres pantallas), dos semanas: más filas de las que caben.
    const huge = Array.from({ length: 1200 }, (_, i) => [`s${Math.floor(i / GRID_CELLS)}`, i % GRID_CELLS, 1, 0, 0])
    const many = batch({ weeks: [{ week: MONDAY, cells: huge }] })
    expect(1200).toBeGreaterThan(MAX_STATS_ROWS)
    expect(parseStats(many, TODAY)).toEqual({ ok: false, error: 'lote demasiado grande' })
  })
})

describe('POST /v1/stats', () => {
  test('suma el lote sin guardar nada de quien lo manda', async () => {
    const { deps, memory } = testDeps()
    const response = await post(deps)
    expect(response.status).toBe(204)
    expect(response.headers.get('access-control-allow-origin')).toBe(ORIGIN)
    const saved = [...memory.stats.counts.values()]
    expect(saved.find((r) => r.name === 'u:day')).toMatchObject({ devices: 1 })
    expect(JSON.stringify(saved)).not.toContain('1.2.3.4')
    await post(deps)
    expect([...memory.stats.counts.values()].find((r) => r.name === 'e:task/add')).toMatchObject({ events: 4, devices: 2 })
    expect([...memory.stats.cells.values()].find((r) => r.cell === 500)).toMatchObject({ taps: 6, rage: 2 })
  })

  test('valida lo que llega y limita por IP', async () => {
    const { deps } = testDeps({})
    expect((await post(deps, { v: 1 })).status).toBe(400)
    const limited = testDeps()
    const strict = { ...limited.deps, limits: { ...limited.deps.limits, stats: countingLimiter(2).limiter } }
    expect((await post(strict)).status).toBe(204)
    expect((await post(strict)).status).toBe(204)
    expect((await post(strict)).status).toBe(429)
    expect((await post(strict, batch(), '5.6.7.8')).status).toBe(204)
  })

  test('una misma IP no gasta más que su parte del día', async () => {
    const { deps, memory } = testDeps()
    expect((await post(deps)).status).toBe(204)
    const added = () => [...memory.stats.counts.values()].find((r) => r.name === 'e:task/add')?.events
    const [key] = [...memory.stats.byIp.keys()]
    memory.stats.byIp.set(key!, STATS_IP_DAILY_ROWS)
    expect((await post(deps)).status).toBe(204)
    expect(added()).toBe(2)
    expect((await post(deps, batch(), '5.6.7.8')).status).toBe(204)
    expect(added()).toBe(4)
  })

  test('con el presupuesto del día lleno, descarta sin error y sin escribir', async () => {
    const { deps, memory } = testDeps()
    memory.stats.budget.set(TODAY, STATS_DAILY_ROWS)
    expect((await post(deps)).status).toBe(204)
    expect(memory.stats.counts.size).toBe(0)
  })
})

describe('el panel de uso', () => {
  const owner = (deps: Deps, path: string, key: string | null = FEEDBACK_KEY) =>
    handle(request('GET', path, { origin: null, key }), deps)

  test('sin la clave no se lee nada', async () => {
    const { deps } = testDeps()
    expect((await owner(deps, '/v1/stats?from=2026-09-01&to=2026-09-30', null)).status).toBe(401)
    const closed = { ...deps, config: { ...deps.config, feedbackKey: null } }
    expect((await owner(closed, '/v1/stats?from=2026-09-01&to=2026-09-30')).status).toBe(404)
  })

  test('devuelve lo sumado del periodo, el anterior, las cohortes y las pantallas', async () => {
    const { deps } = testDeps()
    await post(deps)
    await post(
      deps,
      batch({ days: [{ day: '2026-08-20', events: { 'task/add': 5 }, reach: ['task/add'] }], weeks: [] }),
    )
    const response = await owner(deps, `/v1/stats?from=2026-08-31&to=${TODAY}`)
    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('no-store')
    const { data } = (await response.json()) as { data: Record<string, unknown[][]> }
    expect(data.daily).toContainEqual([TODAY, 'ios', '1.9', 'u:day', 1, 1])
    expect(data.names).toContainEqual(['e:task/add', 2, 1])
    expect(data.names).toContainEqual(['d:lang:es', 1, 1])
    expect(data.previous).toContainEqual(['e:task/add', 5, 1])
    expect(data.cohorts).toContainEqual([MONDAY, MONDAY, 1])
    expect(data.screens).toContainEqual(['1.9', 'agenda', 3])
    expect((await owner(deps, `/v1/stats?from=${TODAY}`)).status).toBe(400)
  })

  test('con una versión elegida, solo esa (más lo que no va por versión)', async () => {
    const { deps } = testDeps()
    await post(deps)
    await post(deps, batch({ version: '1.8', weeks: [] }))
    const response = await owner(deps, `/v1/stats?from=${MONDAY}&to=${TODAY}&version=1.8`)
    const { data } = (await response.json()) as { data: Record<string, unknown[][]> }
    expect(data.names).toContainEqual(['e:task/add', 2, 1])
    expect(data.names).toContainEqual(['d:sess:30', 4, 0])
  })

  test('el mapa de calor de una pantalla, con lo más tocado primero', async () => {
    const { deps } = testDeps()
    await post(deps)
    const response = await owner(deps, `/v1/stats/heat?from=${MONDAY}&to=${TODAY}&screen=agenda&version=1.9`)
    expect(response.status).toBe(200)
    const { data } = (await response.json()) as { data: { cells: number[][]; targets: unknown[][] } }
    expect(data.cells).toContainEqual([500, 3, 1, 0])
    expect(data.targets).toEqual([['composer__send', 3, 1, 0, 1]])
    expect((await owner(deps, `/v1/stats/heat?from=${MONDAY}&to=${TODAY}`)).status).toBe(400)
  })

  test('lo que pasa de 13 meses se borra', async () => {
    const { deps, memory } = testDeps()
    await post(deps)
    await deps.store.deleteStatsBefore('2026-09-08', TODAY)
    expect([...memory.stats.counts.values()].every((r) => r.day >= '2026-09-08')).toBe(true)
    expect(memory.stats.cells.size).toBe(0)
  })
})
