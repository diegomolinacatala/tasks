/**
 * Sugerencias: quien la manda rodea con el dedo una parte de la pantalla y escribe qué cambiaría. Aquí,
 * la parte pura: el trazo, la zona que abarca, lo que se cuenta de ella y el envío al buzón del Worker.
 */
import type { Language } from './i18n'
import { pick } from './i18n'

export interface Point {
  x: number
  y: number
}

export interface Region {
  x: number
  y: number
  width: number
  height: number
}

export interface Viewport {
  width: number
  height: number
}

/** Un trazo más corto que esto es un toque: se rodea un círculo alrededor del dedo. */
export const TAP_PX = 24
const TAP_RADIUS = 36
/** Aire alrededor del trazo: el dedo rodea por fuera de lo que señala, pero no siempre del todo. */
const PAD = 8
export const MAX_MESSAGE = 2000
export const MAX_ELEMENTS = 10
const MAX_LABEL = 80
const MAX_PATH = 120
/** La foto en base64: ~500 KB de JPEG. Más que esto no hace falta para ver de qué se habla. */
export const MAX_SHOT_CHARS = 700_000
/** Una subida atascada (cobertura mala) no deja el botón en "Enviando…" para siempre. */
export const SEND_TIMEOUT_MS = 20_000
const SHOT_PREFIX = /^data:image\/jpeg;base64,/

/** Lo que se cuenta de cada cosa rodeada: su texto (si se comparte la foto) y dónde está en la app. */
export interface ElementInfo {
  label: string
  path: string
}

export interface FeedbackContext {
  /** Pestaña y, si había uno abierto, el panel. */
  screen: string
  sheet: string | null
  region: Region | null
  viewport: Viewport
  elements: string[]
  app: { version: string; platform: 'ios' | 'web'; language: Language; theme: 'light' | 'dark' }
  device: string
}

export interface FeedbackReport {
  message: string
  /** JPEG en `data:` con lo rodeado pintado encima, o `null` si no se adjunta. */
  shot: string | null
  context: FeedbackContext
}

export function strokeLength(points: readonly Point[]): number {
  let length = 0
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!
    const b = points[i]!
    length += Math.hypot(b.x - a.x, b.y - a.y)
  }
  return length
}

export const isTap = (points: readonly Point[]): boolean => strokeLength(points) < TAP_PX

/** Círculo que se dibuja cuando, en lugar de rodear, se toca. */
export function tapRing(center: Point, radius = TAP_RADIUS, steps = 28): Point[] {
  return Array.from({ length: steps + 1 }, (_, i) => {
    const angle = (i / steps) * Math.PI * 2
    return { x: center.x + Math.cos(angle) * radius, y: center.y + Math.sin(angle) * radius }
  })
}

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max)

/** Rectángulo de lo rodeado, con un poco de aire y dentro de la pantalla. `null` sin trazo. */
export function regionOf(points: readonly Point[], viewport: Viewport): Region | null {
  const first = points[0]
  if (!first) return null
  const outline = isTap(points) ? tapRing(points[points.length - 1]!) : points
  const xs = outline.map((point) => point.x)
  const ys = outline.map((point) => point.y)
  const left = clamp(Math.min(...xs) - PAD, 0, viewport.width)
  const top = clamp(Math.min(...ys) - PAD, 0, viewport.height)
  const right = clamp(Math.max(...xs) + PAD, 0, viewport.width)
  const bottom = clamp(Math.max(...ys) + PAD, 0, viewport.height)
  return { x: Math.round(left), y: Math.round(top), width: Math.round(right - left), height: Math.round(bottom - top) }
}

const fixed = (value: number) => Math.round(value * 10) / 10

/** Trazo suavizado para SVG (y para el lienzo con `Path2D`): curvas por los puntos medios. */
export function strokePath(points: readonly Point[]): string {
  const first = points[0]
  if (!first) return ''
  if (points.length < 3) return points.map((point, i) => `${i ? 'L' : 'M'}${fixed(point.x)} ${fixed(point.y)}`).join(' ')
  let path = `M${fixed(first.x)} ${fixed(first.y)}`
  for (let i = 1; i < points.length - 1; i++) {
    const point = points[i]!
    const next = points[i + 1]!
    path += ` Q${fixed(point.x)} ${fixed(point.y)} ${fixed((point.x + next.x) / 2)} ${fixed((point.y + next.y) / 2)}`
  }
  const last = points[points.length - 1]!
  return `${path} L${fixed(last.x)} ${fixed(last.y)}`
}

/** Puntos repartidos por dentro de la zona: en cada uno se mira qué hay debajo. */
export function samplePoints(region: Region, steps = 5): Point[] {
  const points: Point[] = []
  for (let row = 0; row < steps; row++) {
    for (let column = 0; column < steps; column++) {
      points.push({
        x: region.x + (region.width * (column + 0.5)) / steps,
        y: region.y + (region.height * (row + 0.5)) / steps,
      })
    }
  }
  return points
}

const shorten = (text: string, max: number) => {
  const flat = text.replace(/\s+/g, ' ').trim()
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat
}

/**
 * Lo rodeado, en líneas que se leen: "Cena con Carlota — agenda › tl-row › row__title". Sin la foto
 * no van los textos (son las tareas de quien escribe): solo dónde está.
 */
export function describeElements(found: readonly ElementInfo[], withText: boolean): string[] {
  const lines: string[] = []
  for (const { label, path } of found) {
    const text = withText ? shorten(label, MAX_LABEL) : ''
    const where = shorten(path, MAX_PATH)
    const line = text && where ? `${text} — ${where}` : text || where
    if (line && !lines.includes(line)) lines.push(line)
    if (lines.length >= MAX_ELEMENTS) break
  }
  return lines
}

export const cleanMessage = (text: string): string =>
  text
    .replace(/\r\n?/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, MAX_MESSAGE)

/** "iPhone · iOS 18.5", "Mac · Safari"… Solo para saber dónde mirar; nada que identifique a nadie. */
export function deviceLabel(userAgent: string): string {
  const ios = /\b(iPhone|iPad|iPod).*? OS (\d+)[_.](\d+)/.exec(userAgent)
  if (ios) return `${ios[1]} · iOS ${ios[2]}.${ios[3]}`
  const system = /Android/.test(userAgent)
    ? 'Android'
    : /Mac OS X/.test(userAgent)
      ? 'Mac'
      : /Windows/.test(userAgent)
        ? 'Windows'
        : 'Otro'
  const browser = /Edg\//.test(userAgent)
    ? 'Edge'
    : /Firefox\//.test(userAgent)
      ? 'Firefox'
      : /Chrome\//.test(userAgent)
        ? 'Chrome'
        : /Safari\//.test(userAgent)
          ? 'Safari'
          : 'navegador'
  return `${system} · ${browser}`
}

/** Lo que viaja al Worker: la foto sin la cabecera `data:` y el mensaje ya limpio. */
export function feedbackBody(report: FeedbackReport) {
  const shot = report.shot && SHOT_PREFIX.test(report.shot) ? report.shot.replace(SHOT_PREFIX, '') : null
  return {
    message: cleanMessage(report.message),
    shot: shot && shot.length <= MAX_SHOT_CHARS ? shot : null,
    context: report.context,
  }
}

type Fetch = (input: string, init?: RequestInit) => Promise<Response>

/** Envía la sugerencia al buzón. Falla con un mensaje para enseñar tal cual. */
export async function postFeedback(baseUrl: string, report: FeedbackReport, fetchImpl: Fetch = (input, init) => fetch(input, init)) {
  const body = feedbackBody(report)
  if (!body.message) throw new Error(pick({ es: 'Escribe algo antes de enviar.', en: 'Write something before sending.' }))
  let response: Response
  const abort = new AbortController()
  const timer = setTimeout(() => abort.abort(), SEND_TIMEOUT_MS)
  try {
    response = await fetchImpl(`${baseUrl.replace(/\/+$/, '')}/v1/feedback`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: abort.signal,
    })
  } catch {
    throw new Error(pick({ es: 'Sin conexión. Prueba otra vez en un rato.', en: 'No connection. Try again in a bit.' }))
  } finally {
    clearTimeout(timer)
  }
  if (response.ok) return
  if (response.status === 429) {
    throw new Error(pick({ es: 'Demasiadas seguidas. Prueba más tarde.', en: 'Too many in a row. Try again later.' }))
  }
  if (response.status === 507) {
    throw new Error(pick({ es: 'El buzón está lleno. Prueba otro día.', en: 'The inbox is full. Try another day.' }))
  }
  throw new Error(pick({ es: `No se pudo enviar (error ${response.status}).`, en: `Couldn’t send it (error ${response.status}).` }))
}
