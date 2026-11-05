/**
 * Estadísticas de uso anónimas (ver "Estadísticas" en CLAUDE.md). El móvil agrega en local y manda
 * lotes de deltas sin ningún identificador; aquí se validan y se convierten en contadores, que es lo
 * único que se guarda: ni el lote, ni la IP, ni nada que diga qué dispositivo mandó qué.
 */
import type { CellRow, CountRow, StatsRows, TargetRow } from './types'
import type { Result } from './validate'

/** Versión del lote. Una que no se conoce se rechaza: mejor perderla que leerla mal. */
export const STATS_VERSION = 1
export const MAX_STATS_BODY_BYTES = 96_000
/** Cada fila es una escritura de D1: más de esto en un lote no lo manda la app (ni tras una semana sin red). */
export const MAX_STATS_ROWS = 600
/** Escrituras de D1 al día para estadísticas: el resto del plan gratuito (100.000) queda para los avisos. */
export const STATS_DAILY_ROWS = 30_000
/**
 * Lo más que escribe una misma IP (anonimizada) en un día: holgado para varios móviles tras la misma red,
 * pero sin que nadie solo pueda agotar el presupuesto de todos.
 */
export const STATS_IP_DAILY_ROWS = 4000
/** Un móvil sin conexión manda lo suyo al volver; lo más viejo ya no cuenta. */
export const MAX_LATE_DAYS = 35
/** Lo que se guarda: unos 13 meses (la AEPD pide no pasar de 25 para medir audiencia). */
export const STATS_KEEP_DAYS = 400
/** Lo más largo que se puede pedir al panel de una vez. */
export const MAX_RANGE_DAYS = 400

/** La rejilla del mapa de calor: la misma que en la app (`src/lib/stats/taps.ts`). */
export const GRID_COLS = 16
export const GRID_ROWS = 32
export const GRID_CELLS = GRID_COLS * GRID_ROWS

const MAX_DAYS = 8
const MAX_WEEKS = 2
const MAX_EVENTS = 200
const MAX_METRICS = 12
const MAX_BUCKETS = 40
const MAX_ERRORS = 10
const MAX_CELLS = 1200
const MAX_TARGETS = 400
const MAX_COUNT = 100_000

const DAY = /^\d{4}-\d{2}-\d{2}$/
/**
 * Los eventos que cuenta la app, por familias: los tipos de acción del reducer (con sus rasgos,
 * `task/add+time`), las pantallas y paneles, y lo que no pasa por el reducer. Lo demás se descarta: así
 * nadie llena las tablas de nombres inventados.
 */
const EVENT =
  /^(?:(?:task|tasks|reminder|board|scope|section|sections|place|routine|shopping|block|settings|event|state)\/[a-zA-Z]{1,24}(?:\+[a-z]{1,16})?|(?:view|sheet)\/[a-z][a-z0-9:_-]{0,31}|(?:ui|add|inbox|widget)\/[a-z][a-z-]{0,23}|sessions|seconds)$/
/** Las distribuciones que manda la app (las del ping semanal, idioma, tema…, van aparte). */
const METRICS = new Set(['boot', 'lat', 'sess', 'hour'])
const BUCKET = /^[a-z0-9._+-]{1,16}$/
const SCREEN = /^[a-z][a-z0-9:_-]{0,31}$/
const TARGET = /^[a-z][a-z0-9_-]{0,47}$/
const VERSION = /^\d{1,3}(?:\.\d{1,3}){1,2}$/
/** "TypeError@index-3f2a.js:1:2345 cannot read properties": la app ya quita lo que va entre comillas. */
const SIGNATURE = /^[\w .:@/()#,<>[\]-]{1,120}$/

/** Lo que cambia con cada versión de la app (el arranque, lo que tarda un toque) va por versión. */
const BUILD_METRICS = new Set(['boot', 'lat'])
const LANGS = new Set(['es', 'en'])
const THEMES = new Set(['light', 'dark', 'auto'])
const SIZES = new Set(['s', 'm', 'l'])

const DAY_MS = 86_400_000

const ok = <T>(value: T): Result<T> => ({ ok: true, value })
const fail = <T>(error: string): Result<T> => ({ ok: false, error })
const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

export const utcDay = (ms: number): string => new Date(ms).toISOString().slice(0, 10)

/** Días desde 1970-01-01, o `null` si no es una fecha que exista. */
export function dayIndex(day: unknown): number | null {
  if (typeof day !== 'string' || !DAY.test(day)) return null
  const [year, month, date] = day.split('-').map(Number) as [number, number, number]
  const ms = Date.UTC(year, month - 1, date)
  const back = new Date(ms)
  if (back.getUTCFullYear() !== year || back.getUTCMonth() !== month - 1 || back.getUTCDate() !== date) return null
  return ms / DAY_MS
}

export const dayOf = (index: number): string => utcDay(index * DAY_MS)

/** El lunes de la semana del día `index` (el 1 de enero de 1970 fue jueves). */
export const mondayIndex = (index: number): number => index - ((((index + 3) % 7) + 7) % 7)

const count = (value: unknown): number | null =>
  typeof value === 'number' && Number.isInteger(value) && value > 0 && value <= MAX_COUNT ? value : null

const flag = (value: unknown, max: number): number | null =>
  typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= max ? value : null

const entries = (value: unknown, max: number): [string, unknown][] =>
  isObject(value) ? Object.entries(value).slice(0, max) : []

/** Suma en el sitio de su clave: un lote no lleva dos filas con la misma. */
function accumulate<T>(map: Map<string, T>, key: string, row: T, merge: (a: T, b: T) => T) {
  const previous = map.get(key)
  map.set(key, previous ? merge(previous, row) : row)
}

const mergeCount = (a: CountRow, b: CountRow): CountRow => ({ ...a, events: a.events + b.events, devices: a.devices + b.devices })
const mergeCell = (a: CellRow, b: CellRow): CellRow => ({ ...a, taps: a.taps + b.taps, rage: a.rage + b.rage, dead: a.dead + b.dead })
const mergeTarget = (a: TargetRow, b: TargetRow): TargetRow => ({
  ...a,
  taps: a.taps + b.taps,
  rage: a.rage + b.rage,
  dead: a.dead + b.dead,
  slow: a.slow + b.slow,
})

interface Build {
  platform: string
  version: string
}

/**
 * El ping del día: se cuenta una vez por dispositivo y día (y por semana y mes, con sus banderas).
 * Lo que describe al dispositivo (idioma, tema, pantalla, constancia, cohorte) va sin plataforma ni
 * versión y solo una vez por semana: nunca se cruzan dimensiones que pudieran señalar a alguien.
 */
function usageRows(day: string, build: Build, raw: unknown): CountRow[] {
  if (!isObject(raw)) return []
  const one = (name: string, global = false): CountRow => ({
    day,
    platform: global ? '' : build.platform,
    version: global ? '' : build.version,
    name,
    events: 1,
    devices: 1,
  })
  const rows = [one('u:day')]
  if (raw.monthly === true) rows.push(one('u:month'))
  // Los nuevos, sin plataforma ni versión: con pocos usuarios, "uno nuevo en la web 1.9" señalaría a alguien.
  if (raw.first === true) rows.push(one('u:first', true))
  if (raw.weekly !== true) return rows
  rows.push(one('u:week'))
  const cohort = dayIndex(raw.cohort)
  const today = dayIndex(day)
  if (cohort !== null && today !== null && mondayIndex(cohort) === cohort && cohort <= today) {
    rows.push(one(`c:${raw.cohort as string}`, true))
  }
  const active = flag(raw.active28, 28)
  if (active) rows.push(one(`d:active28:${active}`, true))
  if (typeof raw.lang === 'string' && LANGS.has(raw.lang)) rows.push(one(`d:lang:${raw.lang}`, true))
  if (typeof raw.theme === 'string' && THEMES.has(raw.theme)) rows.push(one(`d:theme:${raw.theme}`, true))
  if (typeof raw.size === 'string' && SIZES.has(raw.size)) rows.push(one(`d:size:${raw.size}`, true))
  return rows
}

function dayRows(raw: Record<string, unknown>, build: Build): CountRow[] {
  const day = raw.day as string
  const reach = new Set(Array.isArray(raw.reach) ? raw.reach.filter((name) => typeof name === 'string').slice(0, MAX_EVENTS * 2) : [])
  const row = (name: string, events: number, reached: boolean, global = false): CountRow => ({
    day,
    platform: global ? '' : build.platform,
    version: global ? '' : build.version,
    name,
    events,
    devices: reached ? 1 : 0,
  })
  const rows = usageRows(day, build, raw.usage)
  // Quien comparte además el detalle (funciones, toques), una vez al día: la base de sus porcentajes.
  // El panel no desglosa nada con menos de 3 en una semana (`u:fullweek`). Va aparte del ping porque se
  // puede activar a media jornada.
  if (isObject(raw.full)) {
    rows.push(row('u:full', 1, true))
    if (raw.full.weekly === true) rows.push(row('u:fullweek', 1, true))
  }
  for (const [name, value] of entries(raw.events, MAX_EVENTS)) {
    const n = count(value)
    if (n && EVENT.test(name)) rows.push(row(`e:${name}`, n, reach.has(name)))
  }
  for (const [metric, buckets] of entries(raw.dist, MAX_METRICS)) {
    if (!METRICS.has(metric)) continue
    for (const [bucket, value] of entries(buckets, MAX_BUCKETS)) {
      const n = count(value)
      if (n && BUCKET.test(bucket)) rows.push(row(`d:${metric}:${bucket}`, n, false, !BUILD_METRICS.has(metric)))
    }
  }
  for (const [signature, value] of entries(raw.errors, MAX_ERRORS)) {
    const n = count(value)
    if (n && SIGNATURE.test(signature)) rows.push(row(`x:${signature}`, n, reach.has(signature)))
  }
  return rows
}

function tapRows(raw: Record<string, unknown>, version: string) {
  const week = raw.week as string
  const cells: CellRow[] = []
  const targets: TargetRow[] = []
  for (const item of Array.isArray(raw.cells) ? raw.cells.slice(0, MAX_CELLS) : []) {
    if (!Array.isArray(item)) continue
    const [screen, cell, taps, rage, dead] = item as unknown[]
    const n = count(taps)
    const r = flag(rage, n ?? 0)
    const d = flag(dead, n ?? 0)
    const c = flag(cell, GRID_CELLS - 1)
    if (typeof screen !== 'string' || !SCREEN.test(screen) || !n || r === null || d === null || c === null) continue
    cells.push({ week, version, screen, cell: c, taps: n, rage: r, dead: d })
  }
  for (const item of Array.isArray(raw.targets) ? raw.targets.slice(0, MAX_TARGETS) : []) {
    if (!Array.isArray(item)) continue
    const [screen, target, taps, rage, dead, slow] = item as unknown[]
    const n = count(taps)
    const r = flag(rage, n ?? 0)
    const d = flag(dead, n ?? 0)
    const s = flag(slow, n ?? 0)
    if (typeof screen !== 'string' || !SCREEN.test(screen) || typeof target !== 'string' || !TARGET.test(target)) continue
    if (!n || r === null || d === null || s === null) continue
    targets.push({ week, version, screen, target, taps: n, rage: r, dead: d, slow: s })
  }
  return { cells, targets }
}

/**
 * Un lote de la app → filas que sumar. `today` es el día UTC del servidor: el del móvil puede ir uno
 * por delante o por detrás según su zona. Un día o una semana fuera de plazo se ignoran (un reloj mal
 * puesto no tira el resto); lo que no tiene la forma esperada invalida el lote entero.
 */
export function parseStats(raw: Record<string, unknown>, today: string): Result<StatsRows> {
  if (raw.v !== STATS_VERSION) return fail('versión de lote desconocida')
  if (raw.platform !== 'ios' && raw.platform !== 'web') return fail('plataforma inválida')
  if (typeof raw.version !== 'string' || !VERSION.test(raw.version)) return fail('versión inválida')
  if (!Array.isArray(raw.days) || raw.days.length > MAX_DAYS) return fail('días inválidos')
  const weeks = raw.weeks ?? []
  if (!Array.isArray(weeks) || weeks.length > MAX_WEEKS) return fail('semanas inválidas')
  const now = dayIndex(today)
  if (now === null) return fail('fecha del servidor inválida')
  const build = { platform: raw.platform, version: raw.version }

  const counts = new Map<string, CountRow>()
  for (const day of raw.days) {
    if (!isObject(day)) return fail('día inválido')
    const index = dayIndex(day.day)
    if (index === null) return fail('día inválido')
    if (index < now - MAX_LATE_DAYS || index > now + 1) continue
    for (const row of dayRows(day, build)) {
      accumulate(counts, [row.day, row.platform, row.version, row.name].join('\u0000'), row, mergeCount)
    }
  }

  const cells = new Map<string, CellRow>()
  const targets = new Map<string, TargetRow>()
  for (const week of weeks) {
    if (!isObject(week)) return fail('semana inválida')
    const index = dayIndex(week.week)
    if (index === null || mondayIndex(index) !== index) return fail('semana inválida')
    if (index < mondayIndex(now - MAX_LATE_DAYS) || index > mondayIndex(now + 1)) continue
    const rows = tapRows(week, build.version)
    for (const row of rows.cells) accumulate(cells, [row.week, row.screen, row.cell].join('\u0000'), row, mergeCell)
    for (const row of rows.targets) accumulate(targets, [row.week, row.screen, row.target].join('\u0000'), row, mergeTarget)
  }

  const rows = { counts: [...counts.values()], cells: [...cells.values()], targets: [...targets.values()] }
  if (rows.counts.length + rows.cells.length + rows.targets.length > MAX_STATS_ROWS) return fail('lote demasiado grande')
  return ok(rows)
}

export interface StatsRange {
  from: string
  to: string
}

/** `from` y `to` del panel (días locales de quien lo mira), como mucho `MAX_RANGE_DAYS`. */
export function parseRange(params: URLSearchParams): Result<StatsRange> {
  const from = params.get('from')
  const to = params.get('to')
  const start = dayIndex(from)
  const end = dayIndex(to)
  if (start === null || end === null || start > end) return fail('periodo inválido')
  if (end - start + 1 > MAX_RANGE_DAYS) return fail('periodo demasiado largo')
  return ok({ from: from as string, to: to as string })
}

export const parseVersion = (value: string | null): string | null => (value && VERSION.test(value) ? value : null)
export const parseScreen = (value: string | null): string | null => (value && SCREEN.test(value) ? value : null)

/** El periodo anterior, igual de largo: para decir si algo sube o baja. */
export function previousRange({ from, to }: StatsRange): StatsRange {
  const start = dayIndex(from) as number
  const end = dayIndex(to) as number
  const length = end - start + 1
  return { from: dayOf(start - length), to: dayOf(start - 1) }
}

/** Las cohortes se miran en las 12 últimas semanas, se pida el periodo que se pida. */
export const cohortsFrom = ({ to }: StatsRange): string => dayOf(mondayIndex(dayIndex(to) as number) - 7 * 11)

/** Lo anterior a este día se borra (ver `STATS_KEEP_DAYS`). */
export const statsCutoff = (now: number): string => dayOf((dayIndex(utcDay(now)) as number) - STATS_KEEP_DAYS)

/** Las filas del mapa de calor van por semana: del lunes de `from` al de `to`. */
export function weekRange({ from, to }: StatsRange): StatsRange {
  return { from: dayOf(mondayIndex(dayIndex(from) as number)), to: dayOf(mondayIndex(dayIndex(to) as number)) }
}
