// Piezas de los gráficos: SVG y HTML a mano, sin librerías. Todo lo que viene del servidor se escribe
// con `textContent`. Marcas finas, rejilla de un pelo, un solo eje, y cada gráfico con su tabla.

const NS = 'http://www.w3.org/2000/svg'

export function el(tag, className, text) {
  const node = document.createElement(tag)
  if (className) node.className = className
  if (text !== undefined && text !== null) node.textContent = String(text)
  return node
}

export function svg(tag, attrs = {}) {
  const node = document.createElementNS(NS, tag)
  for (const [name, value] of Object.entries(attrs)) node.setAttribute(name, String(value))
  return node
}

const numbers = new Intl.NumberFormat('es-ES')
const compact = new Intl.NumberFormat('es-ES', { notation: 'compact', maximumFractionDigits: 1 })
const percents = new Intl.NumberFormat('es-ES', { style: 'percent', maximumFractionDigits: 0 })
const finePercents = new Intl.NumberFormat('es-ES', { style: 'percent', maximumFractionDigits: 1 })
const decimals = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 1 })

export const fmt = (n) => (Math.abs(n) >= 10_000 ? compact.format(n) : numbers.format(n))
export const pct = (x) => (x > 0 && x < 0.1 ? finePercents.format(x) : percents.format(x))
export const dec = (x) => decimals.format(x)

const dayLabel = new Intl.DateTimeFormat('es-ES', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })
const shortDay = new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short', timeZone: 'UTC' })
const toDate = (day) => new Date(`${day}T12:00:00Z`)
export const longDay = (day) => dayLabel.format(toDate(day))
export const brief = (day) => shortDay.format(toDate(day)).replace('.', '')

/** Los colores salen de las variables CSS: así siguen al modo claro u oscuro. */
export const cssVar = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim()

// ── Tooltip ────────────────────────────────────────────────────────────────────────────────────────

const tip = () => document.getElementById('tip')
let hideTimer = 0

function placeTip(x, y) {
  const node = tip()
  const { width, height } = node.getBoundingClientRect()
  const left = Math.min(Math.max(8, x - width / 2), window.innerWidth - width - 8)
  const top = y - height - 14 < 8 ? y + 18 : y - height - 14
  node.style.transform = `translate(${Math.round(left)}px, ${Math.round(top)}px)`
}

/** `rows`: `[{ value, label, color? }]`. El valor manda; la etiqueta, detrás. */
export function showTip(title, rows, x, y) {
  const node = tip()
  node.replaceChildren()
  if (title) node.append(el('div', 'tip__title', title))
  for (const row of rows) {
    const line = el('div', 'tip__row')
    if (row.color) {
      const key = el('span', 'tip__key')
      key.style.background = row.color
      line.append(key)
    }
    line.append(el('strong', '', row.value), el('span', 'tip__label', row.label))
    node.append(line)
  }
  node.hidden = false
  placeTip(x, y)
  window.clearTimeout(hideTimer)
}

export function hideTip() {
  const node = tip()
  if (node) node.hidden = true
}

/** Hover, toque y foco dan lo mismo. En el móvil, el tooltip se va solo al rato. */
export function bindTip(target, content) {
  const show = (event) => {
    const { title, rows } = content()
    const box = target.getBoundingClientRect()
    const x = event?.clientX ?? box.left + box.width / 2
    const y = event?.clientY ?? box.top
    showTip(title, rows, x, y)
    target.classList.add('is-hot')
    if (event?.pointerType === 'touch') hideTimer = window.setTimeout(() => leave(), 2600)
  }
  const leave = () => {
    hideTip()
    target.classList.remove('is-hot')
  }
  target.addEventListener('pointerenter', show)
  target.addEventListener('pointermove', (event) => event.pointerType !== 'touch' && show(event))
  target.addEventListener('pointerdown', show)
  target.addEventListener('pointerleave', (event) => event.pointerType !== 'touch' && leave())
  target.addEventListener('focus', () => show(null))
  target.addEventListener('blur', leave)
  if (!target.hasAttribute('tabindex')) target.setAttribute('tabindex', '0')
}

// ── Tabla gemela ──────────────────────────────────────────────────────────────────────────────────

/** Cada gráfico lleva su tabla: los valores se leen sin pasar el dedo por encima. */
export function tableView(headers, rows, label = 'Ver tabla') {
  const details = el('details', 'twin')
  details.append(el('summary', '', label))
  const table = el('table')
  const head = el('tr')
  for (const header of headers) head.append(el('th', '', header))
  table.append(head)
  for (const row of rows) {
    const tr = el('tr')
    row.forEach((cell, i) => tr.append(el(i === 0 ? 'th' : 'td', '', cell)))
    table.append(tr)
  }
  details.append(table)
  return details
}

// ── Columnas apiladas ──────────────────────────────────────────────────────────────────────────────

function niceMax(value) {
  if (value <= 4) return Math.max(1, Math.ceil(value))
  const magnitude = 10 ** Math.floor(Math.log10(value))
  const step = [1, 2, 2.5, 5, 10].find((s) => s * magnitude >= value / 4) * magnitude
  return Math.ceil(value / step) * step
}

/** Una barra con la punta redondeada (4 px) y la base recta, de abajo arriba. */
function barPath(x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height)
  return `M${x},${y + height}V${y + r}Q${x},${y} ${x + r},${y}H${x + width - r}Q${x + width},${y} ${x + width},${y + r}V${y + height}Z`
}

/**
 * `series`: `[{ key, label, color }]` en orden fijo (abajo el primero). `points`: `[{ label, values }]`.
 * Un hueco de 2 px del color de la tarjeta separa los tramos de cada columna. Se dibuja al ancho real de
 * su caja (y otra vez si cambia): con un `viewBox` fijo, el texto de los ejes encogería con el gráfico.
 */
export function columns(options) {
  const box = el('div', 'chart-box')
  let drawn = 0
  const draw = () => {
    const width = Math.round(box.clientWidth)
    if (!width || width === drawn) return
    drawn = width
    box.replaceChildren(columnsAt({ ...options, width }))
  }
  new ResizeObserver(draw).observe(box)
  return box
}

function columnsAt({ series, points, width, label = '', height = 150, axis = (p) => p.label, title = (p) => p.label }) {
  const top = 10
  const bottom = 22
  const plot = height - top - bottom
  const totals = points.map((p) => series.reduce((sum, s) => sum + (p.values[s.key] ?? 0), 0))
  const max = niceMax(Math.max(1, ...totals))
  // Un margen a la derecha para las cifras del eje: así no pisan las últimas columnas.
  const gutter = 30
  const plotWidth = width - gutter
  const slot = plotWidth / Math.max(1, points.length)
  const bar = Math.max(1.5, Math.min(24, slot * 0.68))
  const root = svg('svg', { viewBox: `0 0 ${width} ${height}`, width, height, class: 'chart', role: 'img', 'aria-label': label })

  for (const tick of [0, max / 2, max]) {
    const y = top + plot - (tick / max) * plot
    root.append(svg('line', { x1: 0, x2: plotWidth, y1: y, y2: y, class: 'grid' }))
    const label = svg('text', { x: width, y: y + 4, class: 'tick', 'text-anchor': 'end' })
    label.textContent = fmt(tick)
    root.append(label)
  }

  points.forEach((point, i) => {
    const x = i * slot + (slot - bar) / 2
    let y = top + plot
    const visible = series.filter((s) => (point.values[s.key] ?? 0) > 0)
    visible.forEach((s, j) => {
      const h = ((point.values[s.key] ?? 0) / max) * plot
      const gap = j > 0 ? 2 : 0
      const isTop = j === visible.length - 1
      const segment = isTop
        ? svg('path', { d: barPath(x, y - h, bar, Math.max(0, h - gap), 4), fill: s.color })
        : svg('rect', { x, y: y - h, width: bar, height: Math.max(0, h - gap), fill: s.color })
      root.append(segment)
      y -= h
    })
    const hit = svg('rect', { x: i * slot, y: 0, width: slot, height, class: 'hit', fill: 'transparent' })
    root.append(hit)
    bindTip(hit, () => ({
      title: title(point),
      rows: [
        ...series.map((s) => ({ value: fmt(point.values[s.key] ?? 0), label: s.label, color: s.color })),
        ...(series.length > 1 ? [{ value: fmt(totals[i]), label: 'en total' }] : []),
      ],
    }))
  })

  const marks = [0, Math.floor((points.length - 1) / 2), points.length - 1].filter((v, i, a) => a.indexOf(v) === i)
  for (const i of marks) {
    const point = points[i]
    if (!point) continue
    const anchor = i === 0 ? 'start' : i === points.length - 1 ? 'end' : 'middle'
    const x = i === 0 ? 0 : i === points.length - 1 ? plotWidth : i * slot + slot / 2
    const label = svg('text', { x, y: height - 6, class: 'tick', 'text-anchor': anchor })
    label.textContent = axis(point)
    root.append(label)
  }
  return root
}

/** La leyenda, con la forma de la marca (un cuadrado para columnas y barras). */
export function legend(series) {
  const list = el('ul', 'legend')
  for (const s of series) {
    const item = el('li')
    const swatch = el('span', 'legend__swatch')
    swatch.style.background = s.color
    item.append(swatch, document.createTextNode(s.label))
    list.append(item)
  }
  return list
}

// ── Barras horizontales ────────────────────────────────────────────────────────────────────────────

/**
 * `rows`: `[{ label, value, share, note?, tip?, flag? }]`, ya ordenadas. `share` (0–1) da el largo;
 * `value` es el texto de la punta. Un solo color: la longitud ya dice cuánto.
 */
export function hbars(rows, { color = cssVar('--s1'), empty = 'Sin datos en este periodo.' } = {}) {
  const list = el('ol', 'bars')
  if (!rows.length) list.append(el('li', 'bars__empty', empty))
  for (const row of rows) {
    const item = el('li', row.flag ? 'bars__row is-flagged' : 'bars__row')
    const head = el('div', 'bars__head')
    head.append(el('span', 'bars__label', row.label), el('span', 'bars__value', row.value))
    const track = el('div', 'bars__track')
    const fill = el('div', 'bars__fill')
    fill.style.width = `${Math.max(row.share > 0 ? 1.5 : 0, Math.min(100, row.share * 100))}%`
    fill.style.background = color
    track.append(fill)
    item.append(head, track)
    if (row.note) item.append(el('div', 'bars__note', row.note))
    if (row.flag) item.append(el('div', 'bars__flag', row.flag))
    if (row.tip) bindTip(item, row.tip)
    list.append(item)
  }
  return list
}

// ── Línea mínima ──────────────────────────────────────────────────────────────────────────────────

/** 12 puntos en el tono apagado y el último en el de acento. */
export function sparkline(values, { width = 96, height = 28 } = {}) {
  const root = svg('svg', { viewBox: `0 0 ${width} ${height}`, class: 'spark', 'aria-hidden': 'true' })
  if (values.length < 2) return root
  const max = Math.max(1, ...values)
  const step = width / (values.length - 1)
  const point = (v, i) => [i * step, height - 4 - (v / max) * (height - 8)]
  const d = values.map((v, i) => `${i ? 'L' : 'M'}${point(v, i).join(',')}`).join('')
  root.append(svg('path', { d, class: 'spark__line' }))
  const [x, y] = point(values[values.length - 1], values.length - 1)
  root.append(svg('circle', { cx: x, cy: y, r: 3.5, class: 'spark__dot' }))
  return root
}

// ── Barra segmentada (una parte de un todo) ───────────────────────────────────────────────────────

/** Fina y sin texto: la lista de al lado da nombres y cifras. Como mucho seis partes. */
export function segmented(parts) {
  const total = parts.reduce((sum, part) => sum + part.value, 0)
  const wrap = el('div', 'seg')
  const bar = el('div', 'seg__bar')
  const list = el('ul', 'seg__list')
  for (const part of parts) {
    if (!part.value) continue
    const share = total ? part.value / total : 0
    const block = el('span', 'seg__part')
    block.style.flexGrow = String(part.value)
    block.style.background = part.color
    bindTip(block, () => ({ title: part.label, rows: [{ value: pct(share), label: `${fmt(part.value)} ${part.unit ?? ''}`.trim() }] }))
    bar.append(block)
    const item = el('li')
    const swatch = el('span', 'legend__swatch')
    swatch.style.background = part.color
    item.append(swatch, el('span', 'seg__name', part.label), el('span', 'seg__share', pct(share)))
    list.append(item)
  }
  wrap.append(bar, list)
  return wrap
}
