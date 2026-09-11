// Genera los PNG del manifiesto sin dependencias: SDF + supersampling + encoder PNG mínimo.
import { deflateSync } from 'node:zlib'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'icons')

const BG = [0, 0, 0]
const RING = [31, 31, 36]
const ACCENT = [110, 139, 255]
const SAMPLES = 3

const clamp01 = (value) => Math.min(1, Math.max(0, value))

function roundedRect(px, py, cx, cy, half, radius) {
  const qx = Math.abs(px - cx) - (half - radius)
  const qy = Math.abs(py - cy) - (half - radius)
  const outside = Math.hypot(Math.max(qx, 0), Math.max(qy, 0))
  return outside + Math.min(Math.max(qx, qy), 0) - radius
}

function capsule(px, py, ax, ay, bx, by, radius) {
  const pax = px - ax
  const pay = py - ay
  const bax = bx - ax
  const bay = by - ay
  const h = clamp01((pax * bax + pay * bay) / (bax * bax + bay * bay))
  return Math.hypot(pax - bax * h, pay - bay * h) - radius
}

function over(base, color, alpha) {
  return [
    base[0] + (color[0] - base[0]) * alpha,
    base[1] + (color[1] - base[1]) * alpha,
    base[2] + (color[2] - base[2]) * alpha,
  ]
}

function render(size, glyphScale) {
  const pixels = Buffer.alloc(size * size * 4)
  const c = size / 2
  const half = (size * glyphScale) / 2
  const radius = half * 0.3
  const stroke = size * 0.035
  const tick = size * 0.052

  // Check inscrito en el cuadrado
  const ax = c - half * 0.42
  const ay = c + half * 0.02
  const mx = c - half * 0.1
  const my = c + half * 0.38
  const bx = c + half * 0.45
  const by = c - half * 0.36

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      let ring = 0
      let mark = 0

      for (let sy = 0; sy < SAMPLES; sy += 1) {
        for (let sx = 0; sx < SAMPLES; sx += 1) {
          const px = x + (sx + 0.5) / SAMPLES
          const py = y + (sy + 0.5) / SAMPLES
          const dRing = Math.abs(roundedRect(px, py, c, c, half, radius)) - stroke / 2
          const dMark = Math.min(
            capsule(px, py, ax, ay, mx, my, tick / 2),
            capsule(px, py, mx, my, bx, by, tick / 2),
          )
          if (dRing < 0) ring += 1
          if (dMark < 0) mark += 1
        }
      }

      const total = SAMPLES * SAMPLES
      let color = over(BG, RING, ring / total)
      color = over(color, ACCENT, mark / total)

      const offset = (y * size + x) * 4
      pixels[offset] = Math.round(color[0])
      pixels[offset + 1] = Math.round(color[1])
      pixels[offset + 2] = Math.round(color[2])
      pixels[offset + 3] = 255
    }
  }

  return pixels
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})

function crc32(buffer) {
  let crc = 0xffffffff
  for (const byte of buffer) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([length, body, crc])
}

function encodePng(size, pixels) {
  const header = Buffer.alloc(13)
  header.writeUInt32BE(size, 0)
  header.writeUInt32BE(size, 4)
  header[8] = 8 // bit depth
  header[9] = 6 // RGBA
  const stride = size * 4
  const raw = Buffer.alloc((stride + 1) * size)
  for (let y = 0; y < size; y += 1) {
    raw[y * (stride + 1)] = 0
    pixels.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride)
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

const FAVICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <rect width="64" height="64" fill="#000"/>
  <rect x="12.5" y="12.5" width="39" height="39" rx="12" fill="none" stroke="#1f1f24" stroke-width="2.5"/>
  <path d="M23 32.5 30 40 43 24" fill="none" stroke="#6e8bff" stroke-width="3.6" stroke-linecap="round" stroke-linejoin="round"/>
</svg>
`

mkdirSync(OUT, { recursive: true })

const targets = [
  ['icon-192.png', 192, 0.74],
  ['icon-512.png', 512, 0.74],
  ['icon-maskable-512.png', 512, 0.56],
  ['apple-touch-icon.png', 180, 0.74],
]

for (const [name, size, scale] of targets) {
  writeFileSync(join(OUT, name), encodePng(size, render(size, scale)))
  console.log(`icons/${name}`)
}

writeFileSync(join(OUT, 'favicon.svg'), FAVICON)
console.log('icons/favicon.svg')
