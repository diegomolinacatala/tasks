import type { IsoTime } from '../types'
import { clockLabel, formatTime } from './date'
import { MAX_DURATION, MIN_DURATION, durationLabel } from './duration'
import { pick } from './i18n'
import type { TimelineItem } from './timeline'

/**
 * Soltar algo en el horario, entre dos cosas: en qué hueco cae, a qué hora se propone que empiece y
 * qué duraciones se ofrecen. Lo que hay delante y detrás manda: entre una reunión de 9 a 10 y otra
 * de 12 a 13, se propone empezar a las 10 y, entre lo de siempre, "hasta las 12". Todo en minutos
 * desde medianoche.
 */

/** La hora propuesta va al cuarto de hora. */
export const SLOT_STEP = 15
/** Lo que se da por hecho que ocupa algo sin duración, para proponer lo que va detrás. */
const BARE_SPAN = 30
/** Delante de algo sin nada antes: una hora antes. */
const LEAD = 60
/** Sin nada en el día y no es hoy: media mañana. */
const DEFAULT_START = 9 * 60
const DAY_MIN = 24 * 60
/** Lo último que se puede proponer: que quede un rato de día. */
const LATEST = DAY_MIN - 5
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

/** Marca el final de la lista: soltar detrás de todo. */
export const SLOT_END = '$end'

/** Hasta dónde llega algo: lo que dura o, sin duración, media hora. */
const reachOf = (item: TimelineItem): number => (item.end > item.start ? item.end : item.start + BARE_SPAN)

/**
 * El hueco que queda en la posición `index` de `items` (lo que tiene hora ese día, en orden y sin lo
 * que se está arrastrando): desde que acaba todo lo de delante (una reunión larga sigue aunque dentro
 * haya una corta, como en `buildTimeline`) hasta que empieza lo de detrás. Algo sin duración ocupa
 * media hora a estos efectos, para que lo que va detrás no se proponga a la misma hora.
 */
export function gapAround(items: readonly TimelineItem[], index: number): SlotGap {
  const before = items.slice(0, index).reduce<number | null>((reach, item) => Math.max(reach ?? 0, reachOf(item)), null)
  const next = items[index]
  return { before, after: next ? next.start : null }
}

/** Delante de qué cosa cae el hueco `index`: su id, o `SLOT_END` si va detrás de todo. */
export const slotBefore = (items: readonly TimelineItem[], index: number): string => items[index]?.id ?? SLOT_END

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

/**
 * En qué hueco cae una altura `y` de la pantalla entre unas filas (su `top` y `bottom`): delante de la
 * primera cuya mitad queda por debajo. Como al reordenar una lista.
 */
export function slotIndexAt(y: number, rows: readonly { top: number; bottom: number }[]): number {
  let index = 0
  for (const row of rows) {
    if (y < (row.top + row.bottom) / 2) break
    index += 1
  }
  return index
}

/** Minutos desde medianoche → `HH:MM`. */
export const timeAt = (minutes: number): IsoTime => formatTime(Math.floor(minutes / 60) % 24, minutes % 60)
