// Lo que llega de /v1/stats, ya sumado en D1, convertido en lo que pinta el panel. Sin DOM: se prueba
// con vitest (`worker/panel-tests`).

/** Por debajo de esto no se desglosa nada: con 1 o 2 dispositivos, un desglose señala a alguien. */
export const K = 3

const DAY_MS = 86_400_000

export const dayIndex = (day) => {
  const [y, m, d] = day.split('-').map(Number)
  return Date.UTC(y, m - 1, d) / DAY_MS
}
export const dayOf = (index) => new Date(index * DAY_MS).toISOString().slice(0, 10)
/** El lunes de su semana (el 1 de enero de 1970 fue jueves). */
export const mondayOf = (day) => {
  const index = dayIndex(day)
  return dayOf(index - ((((index + 3) % 7) + 7) % 7))
}
export const monthOf = (day) => day.slice(0, 7)
export const addDays = (day, n) => dayOf(dayIndex(day) + n)

export function daysBetween(from, to) {
  const days = []
  for (let i = dayIndex(from); i <= dayIndex(to); i++) days.push(dayOf(i))
  return days
}

/** El día local de quien mira el panel. */
export function localDay(date = new Date()) {
  const pad = (n) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

export const PRESETS = [
  { id: '7', days: 7, label: '7 días' },
  { id: '30', days: 30, label: '30 días' },
  { id: '90', days: 90, label: '90 días' },
  { id: '365', days: 365, label: '12 meses' },
]

export function rangeFor(days, today = localDay()) {
  return { from: addDays(today, -(days - 1)), to: today }
}

const bump = (map, key, n) => map.set(key, (map.get(key) ?? 0) + n)
const tally = (rows) => new Map(rows.map(([name, events, devices]) => [name, { events, devices }]))

/**
 * El modelo del panel. `deviceDays`: días-dispositivo activos (la base de "en qué parte de los días de
 * uso pasa X"); `fullDays`, los de quien comparte el detalle. `baseBasic`/`baseFull`: el máximo de
 * dispositivos de una semana del periodo, para el umbral `K`. Con una versión elegida, todo (también
 * las bases de los porcentajes) es de esa versión.
 */
export function shape(data, range, version = null) {
  const days = daysBetween(range.from, range.to)
  const daily = new Map(days.map((day) => [day, { ios: 0, web: 0, full: 0, first: 0 }]))
  const weeks = new Map()
  const months = new Map()
  const versions = new Map()
  const platforms = new Map()
  let deviceDays = 0
  let fullDays = 0

  for (const [day, platform, build, name, , devices] of data.daily) {
    const slot = daily.get(day)
    // Lo que va sin versión (los nuevos) cuenta con cualquiera.
    if (!slot || (version && build && build !== version)) continue
    const week = mondayOf(day)
    const w = weeks.get(week) ?? { week: 0, full: 0, first: 0 }
    if (name === 'u:day') {
      slot[platform === 'ios' ? 'ios' : 'web'] += devices
      deviceDays += devices
      bump(versions, build, devices)
      bump(platforms, platform, devices)
    } else if (name === 'u:full') {
      slot.full += devices
      fullDays += devices
    } else if (name === 'u:first') {
      slot.first += devices
      w.first += devices
    } else if (name === 'u:week') w.week += devices
    else if (name === 'u:fullweek') w.full += devices
    else if (name === 'u:month') bump(months, monthOf(day), devices)
    weeks.set(week, w)
  }

  const weekList = [...weeks.entries()].sort(([a], [b]) => (a < b ? -1 : 1))
  const names = tally(data.names)
  const previous = tally(data.previous)
  const dist = new Map()
  for (const [name, { events }] of names) {
    if (!name.startsWith('d:')) continue
    const [, metric, bucket] = name.split(':')
    if (!dist.has(metric)) dist.set(metric, new Map())
    dist.get(metric).set(bucket, events)
  }

  const cohorts = new Map()
  for (const [week, cohort, devices] of data.cohorts) {
    if (!cohorts.has(cohort)) cohorts.set(cohort, new Map())
    cohorts.get(cohort).set(week, devices)
  }

  return {
    range,
    days,
    daily,
    weeks: weekList,
    months,
    versions,
    platforms,
    deviceDays,
    fullDays,
    baseBasic: Math.max(0, ...weekList.map(([, w]) => w.week)),
    baseFull: Math.max(0, ...weekList.map(([, w]) => w.full)),
    names,
    previous,
    dist,
    cohorts,
    screens: data.screens,
  }
}

export const event = (model, name, period = 'now') =>
  (period === 'now' ? model.names : model.previous).get(`e:${name}`) ?? { events: 0, devices: 0 }

/** Dispositivos activos un día (todas las plataformas). */
export const dau = (model, day) => {
  const slot = model.daily.get(day)
  return slot ? slot.ios + slot.web : 0
}

/** La semana o el mes de `day`, con lo que haya de ellos dentro del periodo. */
export const wau = (model, day) => model.weeks.find(([week]) => week === mondayOf(day))?.[1].week ?? 0
export const mau = (model, day) => model.months.get(monthOf(day)) ?? 0

/** Reparto de una distribución en el orden de `buckets` (los que no llegan, a 0). */
export function distribution(model, metric, buckets) {
  const values = model.dist.get(metric) ?? new Map()
  return buckets.map((bucket) => ({ bucket, value: values.get(bucket) ?? 0 }))
}

/** El tramo donde cae el percentil `p` (0–1) de una distribución por tramos. */
export function percentileBucket(rows, p) {
  const total = rows.reduce((sum, row) => sum + row.value, 0)
  if (!total) return null
  let seen = 0
  for (const row of rows) {
    seen += row.value
    if (seen / total >= p) return row.bucket
  }
  return rows[rows.length - 1].bucket
}

/**
 * Retención por cohortes: para cada semana de llegada (las más recientes primero), cuántos había y
 * qué parte volvió cada semana después. Una cohorte de menos de `K` no enseña porcentajes.
 */
export function retention(model, maxWeeks = 12) {
  return [...model.cohorts.entries()]
    .map(([cohort, weeks]) => {
      const size = weeks.get(cohort) ?? 0
      const cells = []
      for (let k = 0; k < maxWeeks; k++) {
        const week = addDays(cohort, 7 * k)
        if (week > model.range.to) break
        cells.push({ week, k, devices: weeks.get(week) ?? 0, share: size ? (weeks.get(week) ?? 0) / size : 0 })
      }
      return { cohort, size, cells, hidden: size < K }
    })
    .sort((a, b) => (a.cohort < b.cohort ? 1 : -1))
    .slice(0, maxWeeks)
}

/** Sube o baja frente al periodo anterior; `null` si antes no había nada con que comparar. */
export function change(now, before) {
  if (!before) return null
  return (now - before) / before
}
