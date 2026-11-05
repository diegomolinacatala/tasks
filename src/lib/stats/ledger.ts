import { addDays, diffDays, startOfWeek } from '../date'
import type { IsoDate } from '../../types'
import type { Usage } from './pending'

/**
 * Lo que el móvil recuerda para el ping del día, solo en este dispositivo: el último día que contó y
 * los días con la app de las últimas cuatro semanas. Nunca sale de aquí tal cual: solo las banderas.
 */
export interface Ledger {
  lastDay: IsoDate | null
  days: readonly IsoDate[]
  /** Último día en que se contó como "comparte el detalle". */
  fullDay: IsoDate | null
}

export const emptyLedger = (): Ledger => ({ lastDay: null, days: [], fullDay: null })

export const WINDOW_DAYS = 28

export interface UsageContext {
  /** La cohorte guardada en los ajustes; `null`, nunca se ha contado este dispositivo. */
  cohort: IsoDate | null
  lang: Usage['lang']
  theme: Usage['theme']
  size: Usage['size']
}

/**
 * El ping de `today`, o `null` si ya se contó hoy. Semana y mes son los del calendario (la semana
 * empieza en lunes): el servidor suma una por dispositivo en cada uno.
 */
export function usageFor(ledger: Ledger, today: IsoDate, context: UsageContext): { ledger: Ledger; usage: Usage | null } {
  if (ledger.lastDay === today) return { ledger, usage: null }
  const last = ledger.lastDay
  // Un reloj que va hacia atrás no debe contar dos veces la misma semana ni tirar lo guardado.
  if (last && last > today) return { ledger, usage: null }
  const days = [...ledger.days.filter((day) => day < today && diffDays(day, today) < WINDOW_DAYS), today]
  const usage: Usage = {
    weekly: !last || startOfWeek(last) !== startOfWeek(today),
    monthly: !last || last.slice(0, 7) !== today.slice(0, 7),
    first: context.cohort === null,
    cohort: context.cohort ?? startOfWeek(today),
    active28: Math.min(WINDOW_DAYS, days.length),
    lang: context.lang,
    theme: context.theme,
    size: context.size,
  }
  return { ledger: { ...ledger, lastDay: today, days }, usage }
}

/** "Comparte el detalle" hoy: una vez por día (y `weekly` la primera de su semana), o `null` si ya se contó. */
export function fullFor(ledger: Ledger, today: IsoDate): { ledger: Ledger; weekly: boolean } | null {
  const last = ledger.fullDay
  if (last && last >= today) return null
  return { ledger: { ...ledger, fullDay: today }, weekly: !last || startOfWeek(last) !== startOfWeek(today) }
}

/** El ledger guardado, saneado: lo que no se entiende se olvida (como mucho, un día de más). */
export function parseLedger(raw: unknown, today: IsoDate): Ledger {
  if (typeof raw !== 'object' || raw === null) return emptyLedger()
  const { lastDay, days, fullDay } = raw as Record<string, unknown>
  const valid = (value: unknown): value is IsoDate => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
  const oldest = addDays(today, -WINDOW_DAYS)
  return {
    lastDay: valid(lastDay) ? lastDay : null,
    days: Array.isArray(days) ? days.filter(valid).filter((day) => day > oldest).slice(-WINDOW_DAYS) : [],
    fullDay: valid(fullDay) ? fullDay : null,
  }
}

/** Alto de la ventana → tamaño de pantalla (lo que pide la AEPD para medir audiencia, en grueso). */
export const sizeOf = (height: number): Usage['size'] => (height < 700 ? 's' : height > 860 ? 'l' : 'm')
