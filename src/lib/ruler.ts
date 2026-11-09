import { MAX_DURATION, MIN_DURATION, durationLabel } from './duration'

/**
 * La regla de la duración: una pista que empieza abarcando dos horas (con pasos de 5 min, donde está
 * casi todo) y que se estira al mantener el dedo en su final, hasta medio día. Cuanto más abarca, más
 * grueso el paso: la precisión está donde hace falta. Al soltar vuelve al tramo que le queda holgado.
 */

/** Lo que abarca la regla, en minutos, de más corta a más larga. */
export const RULER_SPANS: readonly number[] = [120, 240, 480, MAX_DURATION]

/** Lo elegido tiene que quedar holgado: si llega a este tanto del final, toca la regla siguiente. */
const ROOMY = 0.75

/** El tramo más corto en que cabe lo elegido sin pegarse al final. */
export function spanFor(duration: number | null): number {
  if (duration === null) return RULER_SPANS[0] ?? MAX_DURATION
  return RULER_SPANS.find((span) => duration <= span * ROOMY) ?? MAX_DURATION
}

/** El siguiente tramo al estirarla; en el último se queda. */
export const nextSpan = (span: number): number => RULER_SPANS.find((item) => item > span) ?? MAX_DURATION

/** Minutos de cada paso: 5 en la de dos horas, 15 en la de cuatro y 30 en las más largas. */
export const stepFor = (span: number): number => (span <= 120 ? 5 : span <= 240 ? 15 : 30)

/** La duración en un punto de la regla (0 = principio, 1 = final; fuera se acota). Al principio, ninguna. */
export function durationAt(ratio: number, span: number): number | null {
  const step = stepFor(span)
  const minutes = Math.round((Math.min(1, Math.max(0, ratio)) * span) / step) * step
  if (minutes === 0) return null
  return Math.min(Math.max(minutes, MIN_DURATION), MAX_DURATION)
}

export interface Tick {
  minutes: number
  /** Las horas, en oro y más largas. */
  major: boolean
  label: string | null
}

/** Las marcas de una regla: más finas cuanto más corta, con rótulos que no se pisan. */
export function rulerTicks(span: number): Tick[] {
  const every = span <= 240 ? 15 : span <= 480 ? 30 : 60
  const labelEvery = span <= 120 ? 30 : span <= 240 ? 60 : span <= 480 ? 120 : 180
  return Array.from({ length: Math.floor(span / every) }, (_, index) => {
    const minutes = (index + 1) * every
    return { minutes, major: minutes % 60 === 0, label: minutes % labelEvery === 0 ? durationLabel(minutes) : null }
  })
}
