// Las secciones del panel. Cada una dice una cosa, con su número romano, su gráfico y su tabla.

import {
  brief,
  columns,
  cssVar,
  dec,
  el,
  fmt,
  hbars,
  legend,
  longDay,
  pct,
  segmented,
  sparkline,
  tableView,
} from './charts.js'
import { FEATURES, FLOWS, LANGS, PLATFORMS, SIZES, SOURCES, THEMES, TRAITS, errorLabel } from './labels.js'
import { K, addDays, change, dau, distribution, event, mau, mondayOf, percentileBucket, retention, wau } from './model.js'

export function section(numeral, title, deck) {
  const node = el('section', 'section')
  const head = el('header', 'section__head')
  head.append(el('span', 'numeral', numeral), el('h2', '', title))
  if (deck) head.append(el('p', 'deck', deck))
  node.append(head)
  return node
}

const card = (...children) => {
  const node = el('div', 'card')
  node.append(...children)
  return node
}

const subhead = (text) => el('h3', 'subhead', text)

/** Con menos de `K` dispositivos no se desglosa: se dice por qué, sin cifras. */
function guarded(base, build, who = 'dispositivos') {
  if (base >= K) return build()
  return card(el('p', 'quiet', `Hacen falta al menos ${K} ${who} en el periodo para enseñar esto sin señalar a nadie.`))
}

function deltaNode(now, before) {
  const delta = change(now, before)
  if (delta === null) return el('span', 'delta', before === 0 && now ? 'nuevo' : '')
  const node = el('span', `delta ${delta > 0 ? 'is-up' : delta < 0 ? 'is-down' : ''}`, delta ? pct(Math.abs(delta)) : 'igual')
  node.setAttribute('aria-label', delta > 0 ? `sube ${pct(delta)}` : delta < 0 ? `baja ${pct(-delta)}` : 'igual')
  return node
}

function tile({ label, value, sub, delta, trend, hero = false }) {
  const node = el('div', hero ? 'kpi kpi--hero' : 'kpi')
  node.append(el('div', 'kpi__label', label))
  const row = el('div', 'kpi__row')
  row.append(el('div', 'kpi__value', value))
  if (trend) row.append(sparkline(trend))
  node.append(row)
  const foot = el('div', 'kpi__foot')
  if (delta) foot.append(delta)
  if (sub) foot.append(el('span', 'kpi__sub', sub))
  node.append(foot)
  return node
}

// ── I. Cuánta gente ───────────────────────────────────────────────────────────────────────────────

export function audience(model) {
  const node = section('I', 'Cuánta gente', 'Dispositivos que abren Tasks y aceptaron las estadísticas. Sin cuentas ni identificadores: cada uno cuenta una vez por día, semana y mes.')
  const today = model.range.to
  const monthStart = `${today.slice(0, 7)}-01`
  const lastMonth = addDays(monthStart, -1)
  const lastWeek = addDays(today, -7)
  // Solo se compara con una semana o un mes que el periodo cubre enteros: a medias, engañaría.
  const covers = (day) => model.range.from <= day
  const days = model.days
  const daily = days.map((day) => dau(model, day))
  const average = model.deviceDays / Math.max(1, days.length)
  const monthNow = mau(model, today)
  const monthBefore = covers(`${lastMonth.slice(0, 7)}-01`) ? mau(model, lastMonth) : null
  const weekNow = wau(model, today)
  const weekBefore = covers(mondayOf(lastWeek)) ? wau(model, lastWeek) : null
  const fresh = model.weeks.reduce((sum, [, w]) => sum + w.first, 0)
  const monthDays = days.filter((d) => d >= monthStart).reduce((s, d) => s + dau(model, d), 0)
  const usePerMonth = covers(monthStart) && monthNow ? dec(monthDays / monthNow) : '—'

  const kpis = el('div', 'kpis')
  kpis.append(
    // El mes solo se sabe si el periodo empieza antes que él: con 7 días a mitad de mes, se diría de menos.
    tile({
      hero: true,
      label: 'Este mes',
      value: covers(monthStart) ? fmt(monthNow) : '—',
      sub: !covers(monthStart)
        ? 'mira 30 días o más para verlo'
        : monthBefore === null
          ? 'dispositivos distintos'
          : `el mes pasado, ${fmt(monthBefore)}`,
      delta: covers(monthStart) ? deltaNode(monthNow, monthBefore || null) : null,
    }),
    tile({
      label: 'Esta semana',
      value: fmt(weekNow),
      sub: weekBefore === null ? 'dispositivos distintos' : `la pasada, ${fmt(weekBefore)}`,
      delta: deltaNode(weekNow, weekBefore || null),
    }),
    tile({ label: 'Hoy', value: fmt(dau(model, today)), sub: `media del periodo, ${dec(average)}`, trend: daily.slice(-14) }),
    tile({ label: 'Nuevos', value: fmt(fresh), sub: 'en el periodo' }),
    tile({ label: 'Días de uso al mes', value: usePerMonth, sub: 'por dispositivo, este mes' }),
  )
  node.append(kpis)

  const series = [
    { key: 'ios', label: PLATFORMS.ios, color: cssVar('--s1') },
    { key: 'web', label: PLATFORMS.web, color: cssVar('--s2') },
  ]
  const byWeek = days.length > 92
  const points = byWeek
    ? model.weeks.map(([week, w]) => ({ label: week, values: { ios: w.week, web: 0 }, week: true }))
    : days.map((day) => ({ label: day, values: model.daily.get(day) }))
  const chartSeries = byWeek ? [{ key: 'ios', label: 'Dispositivos en la semana', color: cssVar('--s1') }] : series
  const chart = columns({
    series: chartSeries,
    points,
    label: byWeek ? 'Dispositivos activos por semana' : 'Dispositivos activos cada día, por plataforma',
    axis: (p) => brief(p.label),
    title: (p) => (p.week ? `Semana del ${brief(p.label)}` : longDay(p.label)),
  })
  const table = byWeek
    ? tableView(['Semana', 'Dispositivos'], model.weeks.map(([week, w]) => [brief(week), fmt(w.week)]))
    : tableView(['Día', PLATFORMS.ios, PLATFORMS.web, 'Nuevos'], days.map((day) => {
        const d = model.daily.get(day)
        return [longDay(day), fmt(d.ios), fmt(d.web), fmt(d.first)]
      }))
  node.append(card(subhead(byWeek ? 'Cada semana' : 'Cada día'), chart, byWeek ? el('span') : legend(series), table))
  return node
}

// ── II. Vuelven ──────────────────────────────────────────────────────────────────────────────────

export function returning(model) {
  const node = section('II', 'Vuelven', 'De cada semana de llegada, qué parte sigue abriendo la app las semanas siguientes.')
  const rows = retention(model)
  if (!rows.length) {
    node.append(card(el('p', 'quiet', 'Aún no hay semanas de llegada en el periodo.')))
    return node
  }
  const width = Math.max(...rows.map((r) => r.cells.length))
  const table = el('table', 'cohorts')
  const head = el('tr')
  head.append(el('th', '', 'Llegaron'), el('th', 'num', 'Cuántos'))
  for (let k = 0; k < width; k++) head.append(el('th', 'num', k === 0 ? 'Sem. 0' : `+${k}`))
  table.append(head)
  for (const row of rows) {
    const tr = el('tr')
    tr.append(el('th', '', `Semana del ${brief(row.cohort)}`), el('td', 'num', row.hidden ? `<${K}` : fmt(row.size)))
    for (let k = 0; k < width; k++) {
      const cell = row.cells[k]
      const td = el('td', 'num cohort')
      if (!cell) td.classList.add('is-future')
      else if (row.hidden) td.textContent = '·'
      else {
        td.textContent = pct(cell.share)
        // Más vuelta, más tinta: un solo tono, del papel al coñac. Sobre lo más lleno, la letra cambia.
        td.style.setProperty('--fill', String(Math.round(cell.share * 100)))
        if (cell.share >= 0.6) td.classList.add('is-strong')
        td.title = `${fmt(cell.devices)} de ${fmt(row.size)}`
      }
      tr.append(td)
    }
    table.append(tr)
  }
  const scroller = el('div', 'scroll-x')
  scroller.append(table)
  node.append(card(scroller, el('p', 'quiet small', `Las semanas con menos de ${K} llegadas no enseñan porcentajes.`)))
  return node
}

// ── III. Con qué frecuencia ─────────────────────────────────────────────────────────────────────────

const REGULARITY = [
  ['1', [1, 1], 'Un día'],
  ['2-3', [2, 3], '2 o 3 días'],
  ['4-7', [4, 7], 'De 4 a 7 días'],
  ['8-14', [8, 14], 'De 8 a 14 días'],
  ['15-21', [15, 21], 'De 15 a 21 días'],
  ['22-28', [22, 28], 'Casi a diario (22 o más)'],
]
const SESSION_BUCKETS = [
  ['10', 'Menos de 10 s'],
  ['30', '10–30 s'],
  ['60', '30 s – 1 min'],
  ['180', '1–3 min'],
  ['600', '3–10 min'],
  ['inf', 'Más de 10 min'],
]
const HOURS = Array.from({ length: 24 }, (_, h) => String(h).padStart(2, '0'))

export function frequency(model) {
  const node = section('III', 'Con qué frecuencia', 'Cuántos días de las últimas cuatro semanas se abre, cuánto dura cada vez y a qué hora.')
  node.append(
    guarded(model.baseBasic, () => {
      const active = model.dist.get('active28') ?? new Map()
      const counts = REGULARITY.map(([, [lo, hi], label]) => {
        let value = 0
        for (let d = lo; d <= hi; d++) value += active.get(String(d)) ?? 0
        return { label, value }
      })
      const total = counts.reduce((s, c) => s + c.value, 0)
      const sessions = event(model, 'sessions').events
      const seconds = event(model, 'seconds').events
      const lengths = distribution(model, 'sess', SESSION_BUCKETS.map(([b]) => b))
      const typical = percentileBucket(lengths, 0.5)
      const hours = distribution(model, 'hour', HOURS)
      const hoursTotal = hours.reduce((s, h) => s + h.value, 0)

      const wrap = el('div', 'stack')
      const facts = el('div', 'facts')
      facts.append(
        fact(dec(model.deviceDays ? sessions / model.deviceDays : 0), 'veces que se abre al día, de media, en un día de uso'),
        fact(sessions ? `${dec(seconds / sessions)} s` : '—', 'dura cada vez, de media'),
        fact(typical ? SESSION_BUCKETS.find(([b]) => b === typical)[1] : '—', 'lo típico (la mediana)'),
      )
      wrap.append(card(facts))
      wrap.append(
        card(
          subhead('Días con la app en las últimas 4 semanas'),
          hbars(counts.map((c) => ({ label: c.label, value: total ? pct(c.value / total) : '—', share: total ? c.value / total : 0 }))),
          tableView(['Días', 'Parte'], counts.map((c) => [c.label, total ? pct(c.value / total) : '—'])),
        ),
      )
      const lengthTotal = lengths.reduce((s, l) => s + l.value, 0)
      wrap.append(
        card(
          subhead('Cuánto dura cada vez'),
          hbars(
            lengths.map((l, i) => ({
              label: SESSION_BUCKETS[i][1],
              value: lengthTotal ? pct(l.value / lengthTotal) : '—',
              share: lengthTotal ? l.value / lengthTotal : 0,
            })),
          ),
        ),
      )
      const hourChart = columns({
        series: [{ key: 'n', label: 'Veces que se abre', color: cssVar('--s1') }],
        points: hours.map((h) => ({ label: h.bucket, values: { n: h.value } })),
        height: 120,
        label: 'A qué hora se abre la app',
        axis: (p) => `${p.label} h`,
        title: (p) => `De ${p.label}:00 a ${p.label}:59`,
      })
      wrap.append(
        card(
          subhead('A qué hora se abre'),
          hourChart,
          tableView(['Hora', 'Parte'], hours.map((h) => [`${h.bucket}:00`, hoursTotal ? pct(h.value / hoursTotal) : '—'])),
        ),
      )
      return wrap
    }),
  )
  return node
}

function fact(value, label) {
  const node = el('div', 'fact')
  node.append(el('div', 'fact__value', value), el('div', 'fact__label', label))
  return node
}

// ── IV. Qué se usa ─────────────────────────────────────────────────────────────────────────────────

export function features(model) {
  const node = section('IV', 'Qué se usa', 'En qué parte de los días de uso se hace cada cosa, y cuántas veces. Solo de quien comparte el detalle.')
  node.append(
    guarded(
      model.baseFull,
      () => {
        const base = model.fullDays
        const wrap = el('div', 'stack')
        const sources = SOURCES.map(([name, label], i) => ({
          label,
          value: event(model, name).events,
          color: cssVar(`--part-${i + 1}`),
          unit: 'altas',
        }))
        if (sources.some((s) => s.value)) wrap.append(card(subhead('Cómo nacen las tareas'), segmented(sources)))

        const adds = event(model, 'task/add').events
        wrap.append(
          card(
            subhead('Qué llevan las tareas nuevas'),
            hbars(
              TRAITS.map(([name, label]) => {
                const n = event(model, name).events
                return { label, value: adds ? pct(n / adds) : '—', share: adds ? n / adds : 0 }
              }).sort((a, b) => b.share - a.share),
            ),
          ),
        )

        for (const { group, items } of FEATURES) {
          const rows = items
            .map(([name, label]) => {
              const now = event(model, name)
              const before = event(model, name, 'before')
              const delta = change(now.events, before.events)
              const trend = delta === null ? (now.events ? 'nuevo' : '') : delta > 0 ? `▲ ${pct(delta)}` : delta < 0 ? `▼ ${pct(-delta)}` : 'igual'
              return {
                label,
                value: base ? pct(now.devices / base) : '—',
                share: base ? now.devices / base : 0,
                note: `${fmt(now.events)} veces${trend ? ` · ${trend} frente al periodo anterior` : ''}`,
                events: now.events,
              }
            })
            .filter((row) => row.events)
            .sort((a, b) => b.share - a.share || b.events - a.events)
          if (rows.length) wrap.append(card(subhead(group), hbars(rows)))
        }

        const flows = FLOWS.map(([name, label]) => [label, fmt(event(model, name).events)])
        wrap.append(card(subhead('La barra, el dictado y la bienvenida'), tableView(['Qué', 'Veces'], flows, 'Ver cifras')))
        return wrap
      },
      'dispositivos que compartan el detalle',
    ),
  )
  return node
}

// ── VI. Pantallas ──────────────────────────────────────────────────────────────────────────────────

const TABS = [
  ['view/agenda', 'Agenda'],
  ['view/inbox', 'Bandeja'],
  ['view/places', 'Lugares'],
  ['view/settings', 'Ajustes'],
]

export function screens(model, screenLabel) {
  const node = section('VI', 'Pantallas', 'Qué pestañas se abren y qué paneles.')
  node.append(
    guarded(model.baseBasic, () => {
      const tabs = TABS.map(([name, label], i) => ({ label, value: event(model, name).events, color: cssVar(`--part-${i + 1}`), unit: 'veces' }))
      const sheets = [...model.names.entries()]
        .filter(([name]) => name.startsWith('e:sheet/'))
        .map(([name, value]) => ({ name: name.slice(8), ...value }))
        .sort((a, b) => b.events - a.events)
      const most = Math.max(1, ...sheets.map((s) => s.events))
      const wrap = el('div', 'stack')
      wrap.append(card(subhead('Pestañas'), segmented(tabs)))
      wrap.append(
        card(
          subhead('Paneles'),
          hbars(sheets.slice(0, 16).map((s) => ({ label: screenLabel(s.name), value: fmt(s.events), share: s.events / most }))),
        ),
      )
      return wrap
    }),
  )
  return node
}

// ── VII. Rendimiento ───────────────────────────────────────────────────────────────────────────────

const BOOT = [
  ['300', 'Menos de 0,3 s'],
  ['600', '0,3–0,6 s'],
  ['1000', '0,6–1 s'],
  ['2000', '1–2 s'],
  ['4000', '2–4 s'],
  ['inf', 'Más de 4 s'],
]
const LATENCY = [
  ['50', 'Menos de 50 ms'],
  ['100', '50–100 ms'],
  ['200', '100–200 ms'],
  ['500', '200–500 ms'],
  ['inf', 'Más de 500 ms'],
]

function bucketBars(model, metric, buckets) {
  const rows = distribution(model, metric, buckets.map(([b]) => b))
  const total = rows.reduce((s, r) => s + r.value, 0)
  return {
    total,
    median: percentileBucket(rows, 0.5),
    p90: percentileBucket(rows, 0.9),
    bars: hbars(rows.map((r, i) => ({ label: buckets[i][1], value: total ? pct(r.value / total) : '—', share: total ? r.value / total : 0 }))),
  }
}

export function performance(model) {
  const node = section('VII', 'Rendimiento', 'Lo que tarda en abrir, lo que tarda en responder un toque y los errores.')
  const label = (buckets, bucket) => buckets.find(([b]) => b === bucket)?.[1] ?? '—'
  node.append(
    guarded(model.baseBasic, () => {
      const wrap = el('div', 'stack')
      const boot = bucketBars(model, 'boot', BOOT)
      const facts = el('div', 'facts')
      facts.append(fact(label(BOOT, boot.median), 'la mitad de los arranques'), fact(label(BOOT, boot.p90), 'nueve de cada diez'))
      wrap.append(card(subhead('Arrancar en frío'), facts, boot.bars))
      const latency = bucketBars(model, 'lat', LATENCY)
      if (latency.total) {
        const quick = el('div', 'facts')
        quick.append(fact(label(LATENCY, latency.median), 'la mitad de los toques'), fact(label(LATENCY, latency.p90), 'nueve de cada diez'))
        wrap.append(card(subhead('Del toque al siguiente fotograma'), quick, latency.bars))
      }
      const errors = [...model.names.entries()]
        .filter(([name]) => name.startsWith('x:'))
        .map(([name, value]) => ({ signature: name.slice(2), ...value }))
        .sort((a, b) => b.devices - a.devices || b.events - a.events)
      const list = el('ol', 'errors')
      if (!errors.length) list.append(el('li', 'quiet', 'Ningún error en este periodo.'))
      for (const e of errors.slice(0, 12)) {
        const item = el('li')
        item.append(el('strong', '', errorLabel(e.signature)), el('span', 'errors__meta', `${fmt(e.events)} veces · ${fmt(e.devices)} días-dispositivo`))
        item.append(el('code', '', e.signature))
        list.append(item)
      }
      wrap.append(card(subhead('Errores'), list))
      return wrap
    }),
  )
  return node
}

// ── VIII. Con qué ──────────────────────────────────────────────────────────────────────────────────

export function devices(model) {
  const node = section('VIII', 'Con qué', 'Plataforma, versión, idioma, tema y tamaño de pantalla. Cada cosa por separado: nunca se cruzan.')
  node.append(
    guarded(model.baseBasic, () => {
      const wrap = el('div', 'stack')
      const parts = (entries, labels) =>
        entries.map(([key, value], i) => ({ label: labels?.[key] ?? key, value, color: cssVar(`--part-${Math.min(6, i + 1)}`), unit: 'días de uso' }))
      const versions = [...model.versions.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1))
      const shown = versions.slice(0, 5)
      const other = versions.slice(5).reduce((s, [, v]) => s + v, 0)
      wrap.append(card(subhead('Plataforma'), segmented(parts([...model.platforms.entries()], PLATFORMS))))
      wrap.append(card(subhead('Versión'), segmented(parts(other ? [...shown, ['Otras', other]] : shown))))
      const dim = (metric, labels) => [...(model.dist.get(metric) ?? new Map()).entries()]
      wrap.append(card(subhead('Idioma'), segmented(parts(dim('lang'), LANGS))))
      wrap.append(card(subhead('Tema'), segmented(parts(dim('theme'), THEMES))))
      wrap.append(card(subhead('Pantalla'), segmented(parts(dim('size'), SIZES))))
      return wrap
    }),
  )
  return node
}

export { mondayOf }
