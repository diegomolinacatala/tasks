import type { IsoDate, StatsLevel, StatsSettings } from '../../types'

/**
 * Qué estadísticas anónimas manda este dispositivo (ver "Estadísticas" en CLAUDE.md):
 * - `basic`: medir audiencia (cuántos abren la app, cuánto, qué pantallas, cuánto tarda en abrir y los
 *   errores). La AEPD lo admite sin pedir permiso si es anónimo, propio y se informa; se puede quitar.
 * - `full`: además, qué funciones se usan y dónde se toca (el mapa de calor). Solo si se acepta.
 * - `off`: nada.
 */
export const STATS_LEVELS: readonly StatsLevel[] = ['off', 'basic', 'full']

export const isStatsLevel = (value: unknown): value is StatsLevel => STATS_LEVELS.includes(value as StatsLevel)

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

export const defaultStatsSettings = (): StatsSettings => ({ level: null, cohort: null })

/** Lo guardado antes de las estadísticas no lo trae: nadie ha elegido aún. */
export function normalizeStatsSettings(raw: unknown): StatsSettings {
  if (typeof raw !== 'object' || raw === null) return defaultStatsSettings()
  const { level, cohort } = raw as Record<string, unknown>
  return {
    level: isStatsLevel(level) ? level : null,
    cohort: typeof cohort === 'string' && DATE_RE.test(cohort) ? (cohort as IsoDate) : null,
  }
}

/** Sin elegir, se mide la audiencia: lo mínimo, anónimo y que se puede quitar en Ajustes. */
export const effectiveLevel = (stats: StatsSettings): StatsLevel => stats.level ?? 'basic'

/** La ficha que pide el detalle sale una vez: mientras nadie haya elegido. */
export const shouldAskStats = (stats: StatsSettings): boolean => stats.level === null
