import type { StatsLevel } from '../../types'

/**
 * Las tres respuestas a «¿me ayudas a mejorarla?», en este orden y con el mismo peso: la ficha que lo
 * pregunta (`StatsPrompt`) y la última lámina de la bienvenida las dicen igual.
 */
export const STATS_CHOICES: readonly StatsLevel[] = ['full', 'basic', 'off']

export const STATS_CHOICE_COPY = {
  es: { full: 'Sí, con detalle', basic: 'Solo las visitas', off: 'No, gracias' },
  en: { full: 'Yes, with details', basic: 'Visits only', off: 'No, thanks' },
} as const
