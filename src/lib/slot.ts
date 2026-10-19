import type { IsoTime } from '../types'
import { clockLabel, formatTime } from './date'
import { MAX_DURATION, MIN_DURATION, durationLabel } from './duration'
import { pick } from './i18n'
import type { TimelineItem } from './timeline'

/**
 * Soltar algo en el horario: a qué hora cae según la altura del dedo (de cuarto en cuarto de hora,
 * leyendo las horas de lo que hay a esa altura) y qué duraciones se ofrecen. Lo que hay detrás manda
 * en una de ellas: soltado a las 10 con una reunión a las 12, "hasta las 12". Todo en minutos desde
 * medianoche.
 */

/** La hora va al cuarto de hora. */
export const SLOT_STEP = 15
/**
 * Lo que hay que mover el dedo, como poco, para avanzar un cuarto de hora: un hueco corto que vale
 * muchas horas no salta de golpe (ver `slotPoint`).
 */
export const STEP_PX = 8
/** Lo que se da por hecho que ocupa algo sin duración, para proponer lo que va detrás. */
const BARE_SPAN = 30
/** Delante de algo sin nada antes: una hora antes. */
const LEAD = 60
/** Sin nada en el día y no es hoy: media mañana. */
const DEFAULT_START = 9 * 60
const DAY_MIN = 24 * 60
/** Lo último que se puede proponer: que quede un rato de día. */
const LATEST = DAY_MIN - 5
/** Lo último que se elige arrastrando: el último cuarto de hora. */
const LAST_SLOT = DAY_MIN - SLOT_STEP
/** Las duraciones de siempre, además de "sin duración" y "hasta las …". */
const PRESETS = [15, 30, 60, 120] as const

const TEXT = {
  es: { none: 'Sin duración', until: (clock: string) => `Hasta las ${clock}` },
  en: { none: 'No duration', until: (clock: string) => `Until ${clock}` },
} as const

export interface SlotGap {
  /** Cuándo acaba lo que hay delante; `null` si no hay nada. */
  before: number | null
  /** Cuándo empieza lo que hay detrás; `null` si no hay nada. */
  after: number | null
}

/** Marca el final de la lista: la tarjeta va detrás de todo. */
export const SLOT_END = '$end'

/** Hasta dónde llega algo: lo que dura o, sin duración, media hora. */
const reachOf = (item: TimelineItem): number => (item.end > item.start ? item.end : item.start + BARE_SPAN)

/**
 * El hueco alrededor de `start` entre `items` (lo que tiene hora ese día, en orden y sin lo que se
 * está arrastrando): hasta dónde llega lo que empieza antes o a la vez y cuándo empieza lo siguiente.
 */
export function gapAt(items: readonly TimelineItem[], start: number): SlotGap {
  const before = items.filter((item) => item.start <= start).reduce<number | null>((reach, item) => Math.max(reach ?? 0, reachOf(item)), null)
  return { before, after: items.find((item) => item.start > start)?.start ?? null }
}

/** Una altura del horario (px desde arriba) y la hora que le corresponde: el principio de una fila. */
export interface SlotAnchor {
  y: number
  minutes: number
}

/** La hora elegida y la altura a la que se pinta (la de esa hora, no la del dedo: va a saltos). */
export interface SlotPoint {
  minutes: number
  y: number
}

const roundTo = (minutes: number) => Math.round(minutes / SLOT_STEP) * SLOT_STEP
const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max)

/**
 * La hora a la altura `y` del dedo. Las filas no son proporcionales al tiempo (una cápsula de dos
 * horas no mide el doble que una de una), así que se lee entre las dos filas que hay a esa altura: de
 * la hora a la que empieza una a la que empieza la siguiente, repartida a lo alto, y al cuarto de hora.
 * Si en ese trozo hay más horas de las que caben a `STEP_PX` por cuarto (un hueco de seis horas en
 * una fila), la mitad de arriba cuenta desde la primera y la de abajo hasta la segunda: se elige "justo
 * después" o "justo antes", y lo de en medio, con la tarjeta. Por encima de la primera y por debajo de
 * la última sigue a `STEP_PX` por cuarto. `null` sin ninguna fila.
 */
export function slotPoint(y: number, anchors: readonly SlotAnchor[]): SlotPoint | null {
  const sorted = anchors.filter((anchor) => Number.isFinite(anchor.y) && Number.isFinite(anchor.minutes)).sort((a, b) => a.y - b.y)
  if (!sorted.length) return null
  // Las horas no bajan al bajar (una cosa larga y otra corta dentro: manda la que va antes).
  const points = sorted.reduce<SlotAnchor[]>((list, anchor) => [...list, { y: anchor.y, minutes: Math.max(anchor.minutes, list.at(-1)?.minutes ?? -Infinity) }], [])
  const first = points[0]!
  const last = points.at(-1)!
  const result = (minutes: number, at: (snapped: number) => number, min = 0, max = LAST_SLOT): SlotPoint => {
    const snapped = clamp(clamp(roundTo(minutes), min, max), 0, LAST_SLOT)
    return { minutes: snapped, y: at(snapped) }
  }
  if (y <= first.y) return result(first.minutes - ((first.y - y) / STEP_PX) * SLOT_STEP, (t) => first.y - ((first.minutes - t) / SLOT_STEP) * STEP_PX)
  if (y >= last.y) return result(last.minutes + ((y - last.y) / STEP_PX) * SLOT_STEP, (t) => last.y + ((t - last.minutes) / SLOT_STEP) * STEP_PX)

  const index = points.findIndex((point, i) => point.y <= y && y < (points[i + 1]?.y ?? Infinity))
  const a = points[index]!
  const b = points[index + 1]!
  const height = b.y - a.y
  const span = b.minutes - a.minutes
  const within = (value: number) => clamp(value, a.y, b.y)
  // Dentro del trozo, sin pasarse de sus horas; si no cabe ningún cuarto de hora (la marca de "ahora",
  // o de 10:20 a 10:25), el siguiente: nunca uno que quede antes (hoy, ya pasado).
  const low = Math.ceil(a.minutes / SLOT_STEP) * SLOT_STEP
  const high = Math.floor(b.minutes / SLOT_STEP) * SLOT_STEP
  const [min, max] = low <= high ? [low, high] : [low, low]
  if (span <= (height / STEP_PX) * SLOT_STEP)
    return result(a.minutes + ((y - a.y) / height) * span, (t) => within(span > 0 ? a.y + ((t - a.minutes) / span) * height : a.y), min, max)
  if (y - a.y <= height / 2) return result(a.minutes + ((y - a.y) / STEP_PX) * SLOT_STEP, (t) => within(a.y + ((t - a.minutes) / SLOT_STEP) * STEP_PX), min, max)
  return result(b.minutes - ((b.y - y) / STEP_PX) * SLOT_STEP, (t) => within(b.y - ((b.minutes - t) / SLOT_STEP) * STEP_PX), min, max)
}

const roundUp = (minutes: number, step: number) => Math.ceil(minutes / step) * step

/**
 * A qué hora se propone empezar: cuando acaba lo de delante; sin nada delante, una hora antes de lo
 * de detrás; sin nada, ahora (hoy) o a las 9. Hoy no se propone nada que ya haya pasado, salvo que el
 * hueco entero quede en el pasado (entre dos cosas de esta mañana): ahí la hora es la del hueco.
 */
export function suggestedStart(gap: SlotGap, now: number | null): number {
  let start: number
  if (gap.before !== null) start = gap.before
  else if (gap.after !== null) start = Math.max(0, gap.after - LEAD)
  else start = now === null ? DEFAULT_START : roundUp(now, SLOT_STEP)
  const stillAhead = gap.after === null || (now !== null && gap.after > now)
  if (now !== null && start < now && stillAhead) start = roundUp(now, SLOT_STEP)
  return Math.min(Math.max(roundUp(start, 5), 0), LATEST)
}

/** La hora un paso adelante o atrás, sin salirse del día. */
export const steppedStart = (start: number, steps: number): number => Math.min(Math.max(start + steps * SLOT_STEP, 0), LATEST)

export interface SlotOption {
  /** `null`: sin duración. */
  minutes: number | null
  label: string
  /** Es "hasta las …": sigue a la hora de empezar si esta cambia. */
  until?: true
}

/** Lo que quedaría hasta lo de detrás desde `start`, si es un rato válido; si no, `null`. */
export function fillUntil(start: number, gap: SlotGap): number | null {
  if (gap.after === null) return null
  const fill = gap.after - start
  return fill >= MIN_DURATION && fill <= MAX_DURATION ? fill : null
}

/**
 * Las duraciones que se ofrecen: ninguna (lo que no se dice no dura), las de siempre (las que no se
 * salen del día), `keep` (la que ya tenía la tarea, si no está entre ellas) y, si hay algo detrás,
 * hasta que empiece (si no coincide ya con una).
 */
export function slotOptions(start: number, gap: SlotGap, keep: number | null = null): SlotOption[] {
  const text = pick(TEXT)
  const fits = (minutes: number) => start + minutes <= DAY_MIN
  const minutes = new Set<number>(PRESETS.filter(fits))
  if (keep !== null && fits(keep)) minutes.add(keep)
  const options: SlotOption[] = [...minutes].sort((a, b) => a - b).map((value) => ({ minutes: value, label: durationLabel(value) }))
  const fill = fillUntil(start, gap)
  if (fill !== null && !minutes.has(fill)) options.push({ minutes: fill, label: text.until(clockLabel(gap.after ?? 0)), until: true })
  return [{ minutes: null, label: text.none }, ...options]
}

/** Minutos desde medianoche → `HH:MM`. */
export const timeAt = (minutes: number): IsoTime => formatTime(Math.floor(minutes / 60) % 24, minutes % 60)
