import type { IsoDate, StatsLevel, StatsSettings } from '../../types'

/**
 * Qué estadísticas anónimas manda este dispositivo (ver "Estadísticas" en CLAUDE.md). Nada sin elegirlo:
 * Apple pide permiso incluso para datos de uso anónimos (norma 5.1.1(ii)).
 * - `basic`: medir audiencia (cuántos abren la app, cuánto, qué pantallas, cuánto tarda en abrir y los errores).
 * - `full`: además, qué funciones se usan y dónde se toca (el mapa de calor).
 * - `off`: nada.
 */
export const STATS_LEVELS: readonly StatsLevel[] = ['off', 'basic', 'full']

export const isStatsLevel = (value: unknown): value is StatsLevel => STATS_LEVELS.includes(value as StatsLevel)

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

export const defaultStatsSettings = (): StatsSettings => ({ level: null, cohort: null })

/**
 * Lo guardado antes de las estadísticas no lo trae: nadie ha elegido aún. Sin elegir tampoco hay cohorte
 * (la semana en que el dispositivo empezó a contar): la TestFlight 54 contaba sin preguntar y pudo fijarla.
 */
export function normalizeStatsSettings(raw: unknown): StatsSettings {
  if (typeof raw !== 'object' || raw === null) return defaultStatsSettings()
  const { level, cohort } = raw as Record<string, unknown>
  const chosen = isStatsLevel(level) ? level : null
  return {
    level: chosen,
    cohort: chosen !== null && typeof cohort === 'string' && DATE_RE.test(cohort) ? (cohort as IsoDate) : null,
  }
}

/** Sin elegir no se cuenta nada. */
export const effectiveLevel = (stats: StatsSettings): StatsLevel => stats.level ?? 'off'

/** Lo que cuenta: solo así hay cohorte y recolector. */
export const isCounting = (level: StatsLevel | null): boolean => level === 'basic' || level === 'full'

/** La ficha que lo pregunta sale una vez: mientras nadie haya elegido (cerrarla es elegir "Ninguna"). */
export const shouldAskStats = (stats: StatsSettings): boolean => stats.level === null
