// El mapa de calor: la rejilla de toques pintada sobre una captura de referencia de la pantalla. La
// intensidad se acumula en el canal alfa de un lienzo y después se colorea con una rampa cálida (oro →
// coñac → ladrillo), siempre con su escala al lado.

import { bindTip, el, fmt, pct, showTip, hideTip } from './charts.js'

export const COLS = 16
export const ROWS = 32

const STOPS = [
  [0, [227, 194, 127]],
  [0.45, [196, 128, 58]],
  [0.75, [158, 59, 46]],
  [1, [96, 26, 20]],
]

/** 256 colores: el índice es la intensidad acumulada. */
function buildRamp() {
  const ramp = []
  for (let i = 0; i < 256; i++) {
    const t = i / 255
    const upper = STOPS.findIndex(([at]) => at >= t)
    const [b, cb] = STOPS[Math.max(1, upper)]
    const [a, ca] = STOPS[Math.max(0, upper - 1)]
    const k = b === a ? 0 : (t - a) / (b - a)
    ramp.push(ca.map((c, j) => Math.round(c + (cb[j] - c) * k)))
  }
  return ramp
}

const RAMP = buildRamp()

export const rampCss = () =>
  `linear-gradient(90deg, ${STOPS.map(([at, [r, g, b]]) => `rgb(${r} ${g} ${b}) ${Math.round(at * 100)}%`).join(', ')})`

const valueOf = (cell, mode) => (mode === 'rage' ? cell[2] : mode === 'dead' ? cell[3] : cell[1])

/** Pinta `cells` (`[celda, toques, rabia, muertos]`) en el lienzo, ajustado a su tamaño en pantalla. */
export function drawHeat(canvas, cells, mode) {
  const box = canvas.getBoundingClientRect()
  const dpr = Math.min(2, window.devicePixelRatio || 1)
  const width = Math.max(1, Math.round(box.width * dpr))
  const height = Math.max(1, Math.round(box.height * dpr))
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d', { willReadFrequently: true })
  context.clearRect(0, 0, width, height)
  const points = cells.map((cell) => [cell[0], valueOf(cell, mode)]).filter(([, value]) => value > 0)
  if (!points.length) return
  const max = Math.max(...points.map(([, value]) => value))
  const cw = width / COLS
  const ch = height / ROWS
  const radius = Math.max(cw, ch) * 2.2
  for (const [cell, value] of points) {
    const x = ((cell % COLS) + 0.5) * cw
    const y = (Math.floor(cell / COLS) + 0.5) * ch
    const gradient = context.createRadialGradient(x, y, 0, x, y, radius)
    // Raíz cuadrada: así lo poco tocado también se ve sin que lo mucho lo tape todo.
    gradient.addColorStop(0, `rgba(0, 0, 0, ${0.8 * Math.sqrt(value / max)})`)
    gradient.addColorStop(1, 'rgba(0, 0, 0, 0)')
    context.fillStyle = gradient
    context.fillRect(x - radius, y - radius, radius * 2, radius * 2)
  }
  const image = context.getImageData(0, 0, width, height)
  const data = image.data
  for (let i = 0; i < data.length; i += 4) {
    const alpha = data[i + 3]
    if (!alpha) continue
    const [r, g, b] = RAMP[alpha]
    data[i] = r
    data[i + 1] = g
    data[i + 2] = b
    data[i + 3] = Math.min(205, 18 + alpha * 0.9)
  }
  context.putImageData(image, 0, 0)
}

const MODES = [
  { id: 'taps', label: 'Toques' },
  { id: 'rage', label: 'Rabia' },
  { id: 'dead', label: 'Sin efecto' },
]

/**
 * El teléfono con su captura (si la hay) y el lienzo encima. Tocar o pasar por encima dice cuánto se
 * toca ahí. `shot`: URL de la captura de referencia de esa pantalla.
 */
export function heatPhone(cells, { shot, mode, onMode }) {
  const wrap = el('div', 'heat')
  const modes = el('div', 'heat__modes')
  for (const option of MODES) {
    const button = el('button', 'chip chip--small', option.label)
    button.type = 'button'
    button.setAttribute('aria-pressed', String(option.id === mode))
    button.addEventListener('click', () => onMode(option.id))
    modes.append(button)
  }
  const phone = el('div', 'phone')
  const image = el('img', 'phone__shot')
  image.alt = ''
  image.decoding = 'async'
  image.addEventListener('error', () => {
    image.remove()
    phone.classList.add('is-bare')
  })
  if (shot) image.src = shot
  else phone.classList.add('is-bare')
  const canvas = el('canvas', 'phone__heat')
  canvas.setAttribute('role', 'img')
  const total = cells.reduce((sum, cell) => sum + valueOf(cell, mode), 0)
  canvas.setAttribute('aria-label', `${fmt(total)} ${MODES.find((m) => m.id === mode)?.label.toLowerCase()} en esta pantalla`)
  phone.append(image, canvas)

  const byCell = new Map(cells.map((cell) => [cell[0], cell]))
  const point = (event) => {
    const box = canvas.getBoundingClientRect()
    const col = Math.min(COLS - 1, Math.max(0, Math.floor(((event.clientX - box.left) / box.width) * COLS)))
    const row = Math.min(ROWS - 1, Math.max(0, Math.floor(((event.clientY - box.top) / box.height) * ROWS)))
    // La celda y sus vecinas: un dedo cubre más de una.
    let value = 0
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const c = byCell.get((row + dy) * COLS + (col + dx))
        if (c && col + dx >= 0 && col + dx < COLS) value += valueOf(c, mode)
      }
    }
    const label = MODES.find((m) => m.id === mode)?.label.toLowerCase() ?? ''
    showTip(null, [{ value: fmt(value), label: `${label} en esta zona${total ? ` · ${pct(value / total)}` : ''}` }], event.clientX, event.clientY)
  }
  canvas.addEventListener('pointermove', point)
  canvas.addEventListener('pointerdown', point)
  canvas.addEventListener('pointerleave', hideTip)

  const scale = el('div', 'heat__scale')
  const bar = el('span', 'heat__ramp')
  bar.style.backgroundImage = rampCss()
  scale.append(el('span', '', 'Menos'), bar, el('span', '', 'Más'))

  wrap.append(modes, phone, scale)
  // El lienzo se dibuja cuando ya tiene tamaño (y otra vez si lo cambia la ventana).
  const draw = () => drawHeat(canvas, cells, mode)
  requestAnimationFrame(draw)
  new ResizeObserver(draw).observe(canvas)
  return wrap
}

/** La lista de lo tocado: qué elemento, cuánto, y si da rabia o no hace nada. */
export function targetRows(targets, label) {
  const total = targets.reduce((sum, t) => sum + t[1], 0)
  // El largo, frente al más tocado (se lee mejor); el porcentaje, frente al total de la pantalla.
  const most = Math.max(1, ...targets.map((t) => t[1]))
  return targets.slice(0, 25).map(([target, taps, rage, dead, slow]) => {
    const rageShare = taps ? rage / taps : 0
    const deadShare = taps ? dead / taps : 0
    const slowShare = taps ? slow / taps : 0
    const notes = [
      rage ? `${pct(rageShare)} con rabia` : '',
      dead ? `${pct(deadShare)} sin efecto` : '',
      slow ? `${pct(slowShare)} lentos` : '',
    ].filter(Boolean)
    // Solo se señala lo que pasa a menudo y con toques suficientes para que no sea casualidad.
    const flag =
      taps >= 20 && (rageShare >= 0.05 || deadShare >= 0.25 || slowShare >= 0.2)
        ? `⚠ Revisar: ${rageShare >= 0.05 ? 'se toca varias veces seguidas' : deadShare >= 0.25 ? 'muchos toques no hacen nada' : 'tarda en responder'}`
        : ''
    return {
      label: label(target),
      value: fmt(taps),
      share: taps / most,
      note: [target, total ? `${pct(taps / total)} de la pantalla` : '', ...notes].filter(Boolean).join(' · '),
      flag,
      tip: () => ({
        title: label(target),
        rows: [
          { value: fmt(taps), label: `toques · ${pct(total ? taps / total : 0)} de la pantalla` },
          { value: fmt(rage), label: 'con rabia (3 seguidos en el mismo sitio)' },
          { value: fmt(dead), label: 'sin efecto (nada cambia)' },
          { value: fmt(slow), label: 'lentos (más de 200 ms)' },
        ],
      }),
    }
  })
}

export { bindTip }
