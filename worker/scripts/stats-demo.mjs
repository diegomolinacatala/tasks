// Datos de mentira para ver el panel de uso en local (`npm run dev` y http://localhost:8787/uso/).
// Escribe SOLO en la D1 local: unas decenas de dispositivos inventados durante 100 días, con su
// constancia, sus horas, sus funciones y sus toques. Nunca toca la base de datos de verdad.
// Uso: node scripts/stats-demo.mjs   (después, `npm run dev`)
import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const DEVICES = 46
const DAYS = 100
const COLS = 16

let seed = 7
const random = () => {
  seed = (seed * 16807) % 2147483647
  return (seed - 1) / 2147483646
}
const pick = (items) => items[Math.floor(random() * items.length)]
const chance = (p) => random() < p
const between = (lo, hi) => lo + Math.floor(random() * (hi - lo + 1))

const DAY_MS = 86_400_000
const today = new Date()
const todayIndex = Math.floor(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()) / DAY_MS)
const dayOf = (index) => new Date(index * DAY_MS).toISOString().slice(0, 10)
const mondayIndex = (index) => index - ((((index + 3) % 7) + 7) % 7)

const counts = new Map()
const cells = new Map()
const targets = new Map()
const add = (map, key, row, fields) => {
  const previous = map.get(key)
  if (!previous) return void map.set(key, row)
  for (const field of fields) previous[field] += row[field]
}
const count = (day, platform, version, name, events, devices) =>
  add(counts, [day, platform, version, name].join('|'), { day, platform, version, name, events, devices }, ['events', 'devices'])

// Dónde se toca en cada pantalla: [fila, columna, objetivo, peso]. La rejilla es de 16 × 32.
const SPOTS = {
  agenda: [
    [30, 6, 'tabs__tab', 3], [30, 2, 'tabs__tab', 1.5], [30, 10, 'tabs__tab', 0.8], [30, 14, 'tabs__tab', 0.6],
    [27, 7, 'composer__input', 4], [27, 14, 'composer__send', 1.4], [27, 11, 'composer__more', 0.8],
    [5, 3, 'strip__day', 2.2], [5, 7, 'strip__day', 2], [5, 11, 'strip__day', 1.4], [2, 3, 'agenda__month', 0.9],
    [2, 12, 'app__basket', 1.1], [2, 14, 'importance-toggle', 0.5],
    [10, 1, 'row__check', 2.4], [12, 1, 'row__check', 2], [14, 1, 'row__check', 1.6], [11, 6, 'tl__body', 1.8],
    [13, 6, 'tl__body', 1.5], [16, 7, 'tl__body', 1.1], [20, 7, 'row__title', 0.7], [8, 8, 'timeline__head', 0.4],
  ],
  inbox: [
    [30, 2, 'tabs__tab', 2], [30, 6, 'tabs__tab', 2.4], [27, 7, 'composer__input', 3], [6, 1, 'routine__check', 2.6],
    [8, 1, 'routine__check', 2.2], [7, 7, 'routine__main', 1], [15, 1, 'row__check', 1.8], [17, 6, 'row__title', 1.2],
    [4, 13, 'block__add', 0.6], [11, 8, 'routine-note', 0.25],
  ],
  places: [[30, 10, 'tabs__tab', 2], [3, 8, 'places__search', 1.6], [9, 8, 'map-snapshot', 1.4], [19, 8, 'place-card', 2]],
  settings: [[30, 14, 'tabs__tab', 2], [6, 8, 'settings-row', 1.5], [9, 8, 'settings-row', 1.2], [16, 8, 'settings-row', 1], [22, 8, 'settings-row', 0.7]],
  task: [[4, 2, 'row__check', 1.2], [6, 8, 'sheet__title', 1.4], [10, 5, 'chip', 1.8], [14, 4, 'chip', 1.4], [18, 8, 'ruler', 1.2], [1, 8, 'sheet__handle', 0.9], [0, 8, 'sheet__scrim', 1.6]],
  compose: [[8, 4, 'chip', 1.6], [12, 6, 'chip', 1.3], [17, 8, 'ruler', 1], [29, 8, 'compose__add', 2.2], [3, 1, 'compose__fold', 0.7]],
  basket: [[6, 7, 'basket__input', 2], [9, 4, 'basket__suggestion', 1.4], [12, 2, 'row__check', 2.4], [15, 2, 'row__check', 1.8], [2, 13, 'app__basket', 0.8]],
}

function tap(week, version, screen, full) {
  const spots = SPOTS[screen]
  const total = spots.reduce((s, spot) => s + spot[3], 0)
  let r = random() * total
  const spot = spots.find((s) => (r -= s[3]) <= 0) ?? spots[0]
  const row = Math.min(31, Math.max(0, spot[0] + between(-1, 1)))
  const col = Math.min(15, Math.max(0, spot[1] + between(-1, 1)))
  // La tira de la semana da algo de rabia y el título de una fila, toques que no hacen nada.
  const rage = spot[2] === 'strip__day' && chance(0.08) ? 1 : 0
  const dead = (spot[2] === 'row__title' && chance(0.35)) || (spot[2] === 'routine-note' && chance(0.6)) ? 1 : 0
  const slow = screen === 'places' && chance(0.25) ? 1 : 0
  if (!full) return
  add(cells, [week, version, screen, row * COLS + col].join('|'), { week, version, screen, cell: row * COLS + col, taps: 1, rage, dead }, ['taps', 'rage', 'dead'])
  add(targets, [week, version, screen, spot[2]].join('|'), { week, version, screen, target: spot[2], taps: 1, rage, dead, slow }, ['taps', 'rage', 'dead', 'slow'])
}

const HOUR_WEIGHTS = [0.1, 0.05, 0.03, 0.02, 0.02, 0.1, 0.6, 1.6, 2.2, 1.6, 1, 0.9, 1, 1.3, 1.1, 0.8, 0.8, 0.9, 1, 1.2, 1.3, 1.6, 1.4, 0.6]
const hourOf = () => {
  const total = HOUR_WEIGHTS.reduce((a, b) => a + b, 0)
  let r = random() * total
  return HOUR_WEIGHTS.findIndex((w) => (r -= w) <= 0)
}
const sessionBucket = (s) => (s < 10 ? '10' : s < 30 ? '30' : s < 60 ? '60' : s < 180 ? '180' : s < 600 ? '600' : 'inf')
const bootBucket = (ms) => (ms < 300 ? '300' : ms < 600 ? '600' : ms < 1000 ? '1000' : ms < 2000 ? '2000' : ms < 4000 ? '4000' : 'inf')
const latBucket = (ms) => (ms < 50 ? '50' : ms < 100 ? '100' : ms < 200 ? '200' : ms < 500 ? '500' : 'inf')

for (let d = 0; d < DEVICES; d++) {
  const platform = chance(0.72) ? 'ios' : 'web'
  const install = todayIndex - between(0, DAYS - 1)
  const cohort = dayOf(mondayIndex(install))
  const loyalty = 0.25 + random() * 0.7
  const churnAfter = chance(0.35) ? between(3, 40) : Infinity
  const full = chance(0.62)
  const lang = chance(0.82) ? 'es' : 'en'
  const theme = pick(['auto', 'auto', 'light', 'dark'])
  const size = pick(['m', 'm', 'l', 's'])
  const active = []
  let lastWeek = null
  let lastMonth = null
  for (let i = install; i <= todayIndex; i++) {
    const age = i - install
    if (age > churnAfter) break
    if (i !== install && !chance(loyalty * (age > 30 ? 0.85 : 1))) continue
    const day = dayOf(i)
    const version = i > todayIndex - 22 ? '1.9' : '1.8'
    const week = mondayIndex(i)
    const month = day.slice(0, 7)
    active.push(i)
    const recent = active.filter((a) => a > i - 28).length
    count(day, platform, version, 'u:day', 1, 1)
    if (full) count(day, platform, version, 'u:full', 1, 1)
    if (i === install) count(day, platform, version, 'u:first', 1, 1)
    if (month !== lastMonth) count(day, platform, version, 'u:month', 1, 1)
    if (week !== lastWeek) {
      count(day, platform, version, 'u:week', 1, 1)
      if (full) count(day, platform, version, 'u:fullweek', 1, 1)
      count(day, '', '', `c:${cohort}`, 1, 1)
      count(day, '', '', `d:active28:${recent}`, 1, 1)
      count(day, '', '', `d:lang:${lang}`, 1, 1)
      count(day, '', '', `d:theme:${theme}`, 1, 1)
      count(day, '', '', `d:size:${size}`, 1, 1)
    }
    lastWeek = week
    lastMonth = month

    const sessions = between(1, 6)
    let seconds = 0
    const reached = new Set()
    const event = (name, n = 1) => {
      count(day, platform, version, `e:${name}`, n, reached.has(name) ? 0 : 1)
      reached.add(name)
    }
    for (let s = 0; s < sessions; s++) {
      const length = Math.round(4 + random() ** 2.2 * 400)
      seconds += length
      count(day, '', '', `d:sess:${sessionBucket(length)}`, 1, 0)
      count(day, '', '', `d:hour:${String(hourOf()).padStart(2, '0')}`, 1, 0)
      event('view/agenda')
      if (chance(0.55)) event('view/inbox')
      if (chance(0.12)) event('view/places')
      if (chance(0.08)) event('view/settings')
      if (chance(0.4)) event('sheet/task')
      if (chance(0.15)) event('sheet/compose')
      if (chance(0.1)) event('sheet/basket')
      if (s === 0) count(day, platform, version, `d:boot:${bootBucket(180 + random() ** 2 * 2600)}`, 1, 0)
      if (!full) continue
      const weekDay = dayOf(week)
      const taps = between(4, 26)
      for (let t = 0; t < taps; t++) {
        const screen = chance(0.55) ? 'agenda' : chance(0.45) ? 'inbox' : pick(['task', 'compose', 'basket', 'places', 'settings', 'task'])
        tap(weekDay, version, screen, full)
        count(day, platform, version, `d:lat:${latBucket(18 + random() ** 3 * 600)}`, 1, 0)
      }
      if (chance(0.7)) {
        event('task/add')
        event(chance(0.68) ? 'add/typed' : chance(0.6) ? 'add/voice' : 'add/sheet')
        if (chance(0.7)) event('task/add+date')
        if (chance(0.45)) event('task/add+time')
        if (chance(0.38)) event('task/add+before')
        if (chance(0.12)) event('task/add+duration')
        if (chance(0.05)) event('task/add+place')
        if (chance(0.06)) event('task/add+until')
        if (chance(0.5)) event('ui/pill')
        if (chance(0.06)) event('ui/pill-undo')
      }
      if (chance(0.8)) event('task/toggle', between(1, 4))
      if (chance(0.15)) event('task/remove')
      if (chance(0.1)) event('tasks/reschedule')
      if (chance(0.08)) event('task/schedule')
      if (chance(0.35)) event('routine/toggle', between(1, 3))
      if (chance(0.12)) event('shopping/add', between(1, 4))
      if (chance(0.12)) event('shopping/toggle', between(1, 4))
      if (chance(0.15)) event('ui/details')
      if (chance(0.2)) {
        event('ui/voice-start')
        event(chance(0.86) ? 'ui/voice-ok' : 'ui/voice-fail')
      }
      if (platform === 'ios' && chance(0.06)) event('inbox/add')
      if (platform === 'ios' && chance(0.1)) event('widget/task')
    }
    count(day, '', '', 'e:sessions', sessions, 0)
    count(day, '', '', 'e:seconds', seconds, 0)
    if (chance(0.01)) count(day, platform, version, 'x:TypeError@index-3f2a91.js:1:48213', 1, 1)
  }
}

const quote = (v) => (typeof v === 'number' ? String(v) : `'${String(v).replace(/'/g, "''")}'`)
const inserts = (table, columns, rows) => {
  const lines = []
  for (let i = 0; i < rows.length; i += 200) {
    const values = rows.slice(i, i + 200).map((row) => `(${columns.map((c) => quote(row[c])).join(', ')})`)
    lines.push(`INSERT INTO ${table} (${columns.join(', ')}) VALUES ${values.join(', ')};`)
  }
  return lines
}
const sql = [
  'DELETE FROM stats_counts;',
  'DELETE FROM stats_cells;',
  'DELETE FROM stats_targets;',
  ...inserts('stats_counts', ['day', 'platform', 'version', 'name', 'events', 'devices'], [...counts.values()]),
  ...inserts('stats_cells', ['week', 'version', 'screen', 'cell', 'taps', 'rage', 'dead'], [...cells.values()]),
  ...inserts('stats_targets', ['week', 'version', 'screen', 'target', 'taps', 'rage', 'dead', 'slow'], [...targets.values()]),
].join('\n')

const dir = mkdtempSync(join(tmpdir(), 'tasks-stats-'))
const file = join(dir, 'demo.sql')
writeFileSync(file, sql)
const windows = process.platform === 'win32'
const schema = spawnSync('npx', ['wrangler', 'd1', 'execute', 'tasks-push', '--local', '--file=schema.sql'], { stdio: 'inherit', shell: windows })
const result = schema.status === 0
  ? spawnSync('npx', ['wrangler', 'd1', 'execute', 'tasks-push', '--local', `--file=${file}`], { stdio: 'inherit', shell: windows })
  : schema
rmSync(dir, { recursive: true, force: true })
console.log(`${counts.size} contadores, ${cells.size} celdas y ${targets.size} objetivos en la D1 local.`)
process.exit(result.status ?? 1)
