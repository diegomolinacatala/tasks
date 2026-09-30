// La marca de Tasks: una señal de "hecho" trazada a pluma (grueso en la bajada, fino al levantar)
// en tinta azul marino sobre papel marfil, con un filete de oro viejo en el icono. Un solo origen
// para el icono, la pantalla de carga nativa y la de la web: así coinciden al píxel.

export const INK = '#1b2540'
export const PAPER = '#f4efe6'
export const PAPER_LIGHT = '#fbf8f2'
export const PAPER_DEEP = '#e9e0cf'
export const GOLD = '#b8966a'
export const NIGHT = '#141b2e'
/** Tinta marfil del modo oscuro (`--text` de noche en tokens.css). */
export const NIGHT_INK = '#ece4d4'

const round = (value) => Math.round(value * 100) / 100

/** Punto de una Bézier cuadrática. */
const quad = (a, c, b, t) => [
  (1 - t) ** 2 * a[0] + 2 * (1 - t) * t * c[0] + t ** 2 * b[0],
  (1 - t) ** 2 * a[1] + 2 * (1 - t) * t * c[1] + t ** 2 * b[1],
]

/**
 * Contorno de un trazo de grosor variable a lo largo de una cuadrática, con remates redondos.
 * `width(t)` es el semigrosor en cada punto.
 */
function stroke(a, c, b, width, steps = 48) {
  const left = []
  const right = []
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps
    const p = quad(a, c, b, t)
    const q = quad(a, c, b, Math.min(1, t + 0.001))
    const o = quad(a, c, b, Math.max(0, t - 0.001))
    const dx = q[0] - o[0]
    const dy = q[1] - o[1]
    const length = Math.hypot(dx, dy) || 1
    const nx = -dy / length
    const ny = dx / length
    const w = width(t)
    left.push([p[0] + nx * w, p[1] + ny * w])
    right.push([p[0] - nx * w, p[1] - ny * w])
  }
  const start = width(0)
  const end = width(1)
  const pts = (list) => list.map(([x, y]) => `${round(x)} ${round(y)}`).join(' L ')
  return (
    `M ${pts(left)} ` +
    `A ${round(end)} ${round(end)} 0 0 0 ${pts([right[right.length - 1]])} ` +
    `L ${pts(right.slice().reverse())} ` +
    `A ${round(start)} ${round(start)} 0 0 0 ${pts([left[0]])} Z`
  )
}

const ease = (t) => t * t * (3 - 2 * t)

/**
 * La señal en una caja de 100 × 100, centrada a ojo (el peso cae abajo a la izquierda).
 * Pierna corta: baja con fuerza. Pierna larga: sube adelgazando hasta casi desaparecer.
 */
export function checkPath() {
  const a = [21, 52.5]
  const v = [40.5, 72.5]
  const b = [82, 24.5]
  const short = stroke(a, [29.5, 60], v, (t) => 6.2 + 0.8 * ease(t))
  const long = stroke(v, [57.5, 47], b, (t) => 6.8 * (1 - t) ** 0.9 + 0.8 * t)
  return `${short} ${long}`
}

/**
 * Lado de la señal en la pantalla de carga, en puntos. El `#boot` de `index.html` usa la misma
 * medida y la misma caja: la carga nativa y la de la web coinciden al píxel.
 */
export const LAUNCH_MARK_PT = 92

/** Solo la señal, en tinta, para las pantallas de carga (fondo transparente). */
export function markSvg({ color = INK, size = 100 } = {}) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="${size}" height="${size}"><path fill="${color}" d="${checkPath()}"/></svg>`
}

/** Favicon: sin filete (a 16 px sería ruido) y con la señal más grande. */
export function faviconSvg() {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <rect width="100" height="100" rx="22" fill="${PAPER}"/>
  <g transform="translate(9 11) scale(0.84)"><path fill="${INK}" d="${checkPath()}"/></g>
</svg>
`
}

/**
 * El icono de la app (cuadrado; iOS pone las esquinas). Papel marfil con un leve relieve, filete
 * doble de oro viejo y la señal en tinta. `night`: la variante oscura de iOS 18.
 */
export function iconSvg({ size = 1024, inset = 1, night = false } = {}) {
  const paper = night ? NIGHT : PAPER
  const light = night ? '#1d2640' : PAPER_LIGHT
  const deep = night ? '#0e1322' : PAPER_DEEP
  const ink = night ? '#efe6d4' : INK
  const gold = night ? '#c9a878' : GOLD
  // Id propio por variante: si dos iconos comparten página, cada uno usa su degradado.
  const gradient = night ? 'paper-night' : 'paper-day'
  // `inset` < 1 encoge el dibujo dentro del lienzo (icono "maskable" de Android).
  const s = inset
  const pad = (1 - s) * 50
  const frame = (offset, width, opacity) =>
    `<rect x="${round(pad + offset * s)}" y="${round(pad + offset * s)}" width="${round((100 - 2 * offset) * s)}" height="${round((100 - 2 * offset) * s)}" rx="${round((22.5 - offset * 0.62) * s)}" fill="none" stroke="${gold}" stroke-width="${round(width * s)}" opacity="${opacity}"/>`
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="${size}" height="${size}">
  <defs>
    <radialGradient id="${gradient}" cx="42%" cy="34%" r="80%">
      <stop offset="0" stop-color="${light}"/>
      <stop offset="0.55" stop-color="${paper}"/>
      <stop offset="1" stop-color="${deep}"/>
    </radialGradient>
  </defs>
  <rect width="100" height="100" fill="url(#${gradient})"/>
  ${frame(9.5, 1.1, 0.9)}
  ${frame(12, 0.4, 0.75)}
  <g transform="translate(${round(pad + 17 * s)} ${round(pad + 17.5 * s)}) scale(${round(0.66 * s)})">
    <path fill="${ink}" d="${checkPath()}"/>
  </g>
</svg>`
}
