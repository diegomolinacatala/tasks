import { clockLabel } from './date'
import { language } from './i18n'
import { SLOT_STEP } from './slot'
import type { TimelineItem } from './timeline'

/**
 * La cinta de horas de la tarjeta del horario: una tira del día entero que se arrastra bajo una aguja
 * fija. Como el horario es compacto (una cápsula no mide lo que dura), es aquí donde cualquier hora
 * queda a un gesto: 48 px por hora (12 por cuarto, más que un paso del deslizador), con lo que ya hay
 * ese día sombreado para ver los huecos. Todo en minutos desde medianoche; las posiciones, en px desde
 * las 00:00.
 */

export const TAPE_PX_PER_HOUR = 48
const PX_PER_MINUTE = TAPE_PX_PER_HOUR / 60
const DAY_MIN = 24 * 60
/** Lo último que se elige: el último cuarto de hora. */
export const TAPE_LAST = DAY_MIN - SLOT_STEP
/** Lo que ocupa algo sin duración en la cinta: media hora, como al proponer lo que va detrás. */
const BARE_SPAN = 30

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max)

/** Dónde cae una hora en la cinta (px desde las 00:00). */
export const tapeOffset = (minutes: number): number => minutes * PX_PER_MINUTE

/** La hora que hay a esa posición de la cinta, al cuarto de hora y dentro del día. */
export const minutesAtOffset = (px: number): number => clamp(Math.round(px / PX_PER_MINUTE / SLOT_STEP) * SLOT_STEP, 0, TAPE_LAST)

/** Lo que mide el día entero en la cinta. */
export const TAPE_WIDTH = tapeOffset(DAY_MIN)

export interface TapeSpan {
  start: number
  end: number
}

/**
 * Lo ocupado ese día (sin lo que se está colocando), fundido en tramos: dos cosas seguidas o solapadas
 * son una sombra. Lo que no dura ocupa media hora.
 */
export function busySpans(items: readonly TimelineItem[], excludeId: string | null = null): TapeSpan[] {
  const spans = items
    .filter((item) => item.id !== excludeId)
    .map((item) => ({ start: item.start, end: Math.min(DAY_MIN, item.end > item.start ? item.end : item.start + BARE_SPAN) }))
    .sort((a, b) => a.start - b.start)
  return spans.reduce<TapeSpan[]>((merged, span) => {
    const last = merged.at(-1)
    if (last && span.start <= last.end) return [...merged.slice(0, -1), { start: last.start, end: Math.max(last.end, span.end) }]
    return [...merged, span]
  }, [])
}

export interface TapeTick {
  minutes: number
  /** Las horas, en oro y más largas. */
  major: boolean
  /** La cifra de la hora, si lleva. */
  label: string | null
}

/** `9` en español (cada hora); `8 AM`, `12 PM` en inglés (cada dos horas: el rótulo es más largo). */
function hourLabel(hour: number): string | null {
  if (language() !== 'en') return String(hour)
  if (hour % 2 !== 0) return null
  const [clock = '', meridiem = ''] = clockLabel(hour * 60).split(' ')
  return `${clock.replace(/:00$/, '')} ${meridiem}`.trim()
}

/** Las marcas de la cinta: un cuarto de hora cada una, las horas con su cifra. */
export function tapeTicks(): TapeTick[] {
  return Array.from({ length: DAY_MIN / SLOT_STEP }, (_, index) => {
    const minutes = index * SLOT_STEP
    const major = minutes % 60 === 0
    return { minutes, major, label: major ? hourLabel(minutes / 60) : null }
  })
}
