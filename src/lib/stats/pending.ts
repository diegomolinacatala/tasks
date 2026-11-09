import type { IsoDate, Theme } from '../../types'

/**
 * Lo que el móvil lleva contado y aún no ha mandado. Se suma en local, por día (y los toques por
 * semana), y viaja como deltas sin ningún identificador (contrato: `worker/src/stats.ts`).
 */

export const STATS_PROTOCOL = 1
export type StatsPlatform = 'ios' | 'web'

/** El ping del día: banderas, sin identificar a nadie (como el "usage ping" de Brave o DuckDuckGo). */
export interface Usage {
  weekly: boolean
  monthly: boolean
  first: boolean
  cohort: IsoDate
  /** Días distintos con la app en los últimos 28, hoy incluido. */
  active28: number
  lang: 'es' | 'en'
  theme: Theme
  /** Alto de la pantalla: `s` < 700 px, `l` > 860 px, `m` lo demás. */
  size: 's' | 'm' | 'l'
}

export interface DayCounts {
  usage?: Usage
  /**
   * Este dispositivo comparte el detalle ese día (y es el primero de su semana): la base de los
   * porcentajes de funciones y toques. Va aparte del ping porque se puede activar a media jornada.
   */
  full?: { weekly: boolean }
  events: Readonly<Record<string, number>>
  dist: Readonly<Record<string, Readonly<Record<string, number>>>>
  errors: Readonly<Record<string, number>>
}

/** `[toques, rabia, sin efecto]` por `pantalla|celda`; `[…, lentos]` por `pantalla|objetivo`. */
export interface WeekTaps {
  cells: Readonly<Record<string, readonly number[]>>
  targets: Readonly<Record<string, readonly number[]>>
}

export interface Pending {
  version: string
  platform: StatsPlatform
  days: Readonly<Record<IsoDate, DayCounts>>
  weeks: Readonly<Record<IsoDate, WeekTaps>>
}

/** Lo que el servidor admite por lote (`worker/src/stats.ts`). */
export const LIMITS = { days: 8, weeks: 2, events: 200, cells: 1200, targets: 400, errors: 10 } as const

/** Filas que escribe un lote como mucho (el servidor admite 600): lo que no cabe se queda fuera. */
export const MAX_BATCH_ROWS = 550
/** Lo que escribe el ping de un día como mucho (día, mes, primera, semana, cohorte, constancia, idioma, tema, pantalla). */
const USAGE_ROWS = 9

const emptyDay = (): DayCounts => ({ events: {}, dist: {}, errors: {} })
const emptyWeek = (): WeekTaps => ({ cells: {}, targets: {} })

export const emptyPending = (version: string, platform: StatsPlatform): Pending => ({ version, platform, days: {}, weeks: {} })

const withDay = (pending: Pending, day: IsoDate, change: (counts: DayCounts) => DayCounts): Pending => ({
  ...pending,
  days: { ...pending.days, [day]: change(pending.days[day] ?? emptyDay()) },
})

const plus = (record: Readonly<Record<string, number>>, key: string, n: number) => ({ ...record, [key]: (record[key] ?? 0) + n })

export function addEvent(pending: Pending, day: IsoDate, name: string, n = 1): Pending {
  return withDay(pending, day, (counts) => {
    // Un nombre nuevo de más no cabe en el lote: se pierde ese, no el lote.
    if (!(name in counts.events) && Object.keys(counts.events).length >= LIMITS.events) return counts
    return { ...counts, events: plus(counts.events, name, n) }
  })
}

export function addDist(pending: Pending, day: IsoDate, metric: string, bucket: string, n = 1): Pending {
  return withDay(pending, day, (counts) => ({
    ...counts,
    dist: { ...counts.dist, [metric]: plus(counts.dist[metric] ?? {}, bucket, n) },
  }))
}

export function addError(pending: Pending, day: IsoDate, signature: string): Pending {
  return withDay(pending, day, (counts) => {
    if (!(signature in counts.errors) && Object.keys(counts.errors).length >= LIMITS.errors) return counts
    return { ...counts, errors: plus(counts.errors, signature, 1) }
  })
}

export const setUsage = (pending: Pending, day: IsoDate, usage: Usage): Pending =>
  withDay(pending, day, (counts) => ({ ...counts, usage }))

export const setFull = (pending: Pending, day: IsoDate, weekly: boolean): Pending =>
  withDay(pending, day, (counts) => ({ ...counts, full: { weekly: weekly || Boolean(counts.full?.weekly) } }))

export interface TapMark {
  rage: boolean
  dead: boolean
  slow: boolean
}

const sum = (a: readonly number[] | undefined, b: readonly number[]) => b.map((n, i) => n + (a?.[i] ?? 0))

export function addTap(pending: Pending, week: IsoDate, screen: string, cell: number, target: string | null, mark: TapMark): Pending {
  const current = pending.weeks[week] ?? emptyWeek()
  const cellKey = `${screen}|${cell}`
  const targetKey = target ? `${screen}|${target}` : null
  const cellRow = [1, mark.rage ? 1 : 0, mark.dead ? 1 : 0]
  const cells = !(cellKey in current.cells) && Object.keys(current.cells).length >= LIMITS.cells
    ? current.cells
    : { ...current.cells, [cellKey]: sum(current.cells[cellKey], cellRow) }
  const targets =
    !targetKey || (!(targetKey in current.targets) && Object.keys(current.targets).length >= LIMITS.targets)
      ? current.targets
      : { ...current.targets, [targetKey]: sum(current.targets[targetKey], [...cellRow, mark.slow ? 1 : 0]) }
  return { ...pending, weeks: { ...pending.weeks, [week]: { cells, targets } } }
}

/** Corrige un toque ya contado: "sin efecto" solo se sabe un rato después. */
export function markDead(pending: Pending, week: IsoDate, screen: string, cell: number, target: string | null): Pending {
  const current = pending.weeks[week]
  if (!current) return pending
  const cellKey = `${screen}|${cell}`
  const targetKey = target ? `${screen}|${target}` : null
  const cellRow = current.cells[cellKey]
  const targetRow = targetKey ? current.targets[targetKey] : undefined
  return {
    ...pending,
    weeks: {
      ...pending.weeks,
      [week]: {
        cells: cellRow ? { ...current.cells, [cellKey]: sum(cellRow, [0, 0, 1]) } : current.cells,
        targets: targetKey && targetRow ? { ...current.targets, [targetKey]: sum(targetRow, [0, 0, 1, 0]) } : current.targets,
      },
    },
  }
}

export function isEmpty(pending: Pending): boolean {
  return !Object.keys(pending.days).length && !Object.keys(pending.weeks).length
}

function mergeRecords(a: Readonly<Record<string, number>>, b: Readonly<Record<string, number>>) {
  const out: Record<string, number> = { ...a }
  for (const [key, n] of Object.entries(b)) out[key] = (out[key] ?? 0) + n
  return out
}

function mergeRows(a: Readonly<Record<string, readonly number[]>>, b: Readonly<Record<string, readonly number[]>>) {
  const out: Record<string, readonly number[]> = { ...a }
  for (const [key, row] of Object.entries(b)) out[key] = sum(out[key], row)
  return out
}

/** Lo que no se pudo mandar vuelve a sumarse a lo nuevo (`a` es lo de antes). */
export function mergePending(a: Pending, b: Pending): Pending {
  const days: Record<IsoDate, DayCounts> = { ...a.days }
  for (const [day, counts] of Object.entries(b.days)) {
    const previous = days[day]
    if (!previous) {
      days[day] = counts
      continue
    }
    const dist: Record<string, Record<string, number>> = { ...previous.dist }
    for (const [metric, buckets] of Object.entries(counts.dist)) dist[metric] = mergeRecords(dist[metric] ?? {}, buckets)
    days[day] = {
      usage: previous.usage ?? counts.usage,
      ...((previous.full ?? counts.full) ? { full: { weekly: Boolean(previous.full?.weekly || counts.full?.weekly) } } : {}),
      events: mergeRecords(previous.events, counts.events),
      dist,
      errors: mergeRecords(previous.errors, counts.errors),
    }
  }
  const weeks: Record<IsoDate, WeekTaps> = { ...a.weeks }
  for (const [week, taps] of Object.entries(b.weeks)) {
    const previous = weeks[week]
    weeks[week] = previous
      ? { cells: mergeRows(previous.cells, taps.cells), targets: mergeRows(previous.targets, taps.targets) }
      : taps
  }
  return { ...a, days, weeks }
}

/** Lo que se mide con «Solo visitas» (`basic`): pantallas, paneles, visitas, arranque y errores. */
export const BASIC_PREFIXES = ['view/', 'sheet/'] as const
const BASIC_EVENTS = new Set(['sessions', 'seconds'])
const DETAIL_METRICS = new Set(['lat'])

export const isBasicEvent = (name: string): boolean =>
  BASIC_EVENTS.has(name) || BASIC_PREFIXES.some((prefix) => name.startsWith(prefix))

/** Quien retira el detalle no manda lo que ya estaba contado de él: se queda lo básico. */
export function basicOnly(pending: Pending): Pending {
  const days: Record<IsoDate, DayCounts> = {}
  for (const [day, counts] of Object.entries(pending.days)) {
    days[day] = {
      ...(counts.usage ? { usage: counts.usage } : {}),
      events: Object.fromEntries(Object.entries(counts.events).filter(([name]) => isBasicEvent(name))),
      dist: Object.fromEntries(Object.entries(counts.dist).filter(([metric]) => !DETAIL_METRICS.has(metric))),
      errors: counts.errors,
    }
  }
  return { ...pending, days, weeks: {} }
}

/** Lo que el dispositivo ya contó como "lo usó hoy" (un dispositivo cuenta una vez por día). */
export type Reached = Readonly<Record<IsoDate, readonly string[]>>

export interface Batch {
  v: number
  platform: StatsPlatform
  version: string
  days: {
    day: IsoDate
    usage?: Usage
    full?: { weekly: boolean }
    events?: Record<string, number>
    reach?: string[]
    dist?: Record<string, Record<string, number>>
    errors?: Record<string, number>
  }[]
  weeks: { week: IsoDate; cells: (string | number)[][]; targets: (string | number)[][] }[]
}

const newest = <T>(record: Readonly<Record<IsoDate, T>>, max: number) =>
  Object.entries(record)
    .sort(([a], [b]) => (a < b ? 1 : -1))
    .slice(0, max)

/**
 * El lote que se manda y lo que cuenta como alcanzado tras mandarlo. Lo de más de 8 días o 2 semanas
 * atrás se queda fuera (el servidor no lo admitiría).
 */
export function toBatch(pending: Pending, reached: Reached): { batch: Batch; reached: Record<IsoDate, string[]> } {
  const nextReached: Record<IsoDate, string[]> = {}
  const days = newest(pending.days, LIMITS.days).map(([day, counts]) => {
    const already = new Set(reached[day] ?? [])
    const names = [...Object.keys(counts.events), ...Object.keys(counts.errors)]
    const reach = names.filter((name) => !already.has(name))
    nextReached[day] = [...already, ...reach]
    return {
      day,
      ...(counts.usage ? { usage: counts.usage } : {}),
      ...(counts.full ? { full: counts.full } : {}),
      ...(Object.keys(counts.events).length ? { events: { ...counts.events } } : {}),
      ...(reach.length ? { reach } : {}),
      ...(Object.keys(counts.dist).length ? { dist: { ...counts.dist } } : {}),
      ...(Object.keys(counts.errors).length ? { errors: { ...counts.errors } } : {}),
    }
  })
  const split = (key: string) => {
    const at = key.lastIndexOf('|')
    return [key.slice(0, at), key.slice(at + 1)] as const
  }
  // Lo que cabe en el lote: primero los días (los más recientes), después los toques más repetidos.
  const dayRows = (d: (typeof days)[number]) =>
    (d.usage ? USAGE_ROWS : 0) +
    (d.full ? 2 : 0) +
    Object.keys(d.events ?? {}).length +
    Object.values(d.dist ?? {}).reduce((sum, buckets) => sum + Object.keys(buckets).length, 0) +
    Object.keys(d.errors ?? {}).length
  let room = MAX_BATCH_ROWS
  const kept = days.filter((d) => {
    const rows = dayRows(d)
    if (rows > room) return false
    room -= rows
    return true
  })
  const rows = newest(pending.weeks, LIMITS.weeks).flatMap(([week, taps]) => [
    ...Object.entries(taps.cells).map(([key, row]) => ({ week, kind: 'cell' as const, key, row })),
    ...Object.entries(taps.targets).map(([key, row]) => ({ week, kind: 'target' as const, key, row })),
  ])
  const fitting = rows.sort((a, b) => (b.row[0] ?? 0) - (a.row[0] ?? 0)).slice(0, Math.max(0, room))
  const weeks = newest(pending.weeks, LIMITS.weeks)
    .map(([week]) => ({
      week,
      cells: fitting
        .filter((r) => r.week === week && r.kind === 'cell')
        .map((r) => {
          const [screen, cell] = split(r.key)
          return [screen, Number(cell), ...r.row]
        }),
      targets: fitting.filter((r) => r.week === week && r.kind === 'target').map((r) => [...split(r.key), ...r.row]),
    }))
    .filter((w) => w.cells.length || w.targets.length)
  const keptDays = new Set(kept.map((d) => d.day))
  return {
    batch: { v: STATS_PROTOCOL, platform: pending.platform, version: pending.version, days: kept, weeks },
    reached: Object.fromEntries(Object.entries(nextReached).filter(([day]) => keptDays.has(day))),
  }
}
