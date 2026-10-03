import type { IsoDate } from '../types'
import { addDays, dayNameLong, dayNameShort, dayNumber } from './date'
import { language, pick } from './i18n'

/** Un sitio donde dejar lo escrito en el compositor: "Hoy", "Mañana", "Jue 2", "Sin fecha". */
export interface ComposeTarget {
  label: string
  date: IsoDate | null
}

const WORDS = {
  es: { today: 'Hoy', tomorrow: 'Mañana', none: 'Sin fecha' },
  en: { today: 'Today', tomorrow: 'Tomorrow', none: 'No date' },
} as const

const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1)

/**
 * Los destinos del compositor, en orden. El primero es donde se está mirando (`here`: el día
 * elegido en la Agenda, `null` en la Bandeja) y va elegido de entrada; detrás, los de siempre (hoy,
 * mañana y sin fecha), sin repetir el primero.
 */
export function composeTargets(here: IsoDate | null, today: IsoDate): ComposeTarget[] {
  const words = pick(WORDS)
  const usual: ComposeTarget[] = [
    { label: words.today, date: today },
    { label: words.tomorrow, date: addDays(today, 1) },
    { label: words.none, date: null },
  ]
  const current = usual.find((target) => target.date === here) ?? {
    label: here ? `${capitalize(dayNameShort(here))} ${dayNumber(here)}` : words.none,
    date: here,
  }
  return [current, ...usual.filter((target) => target.date !== here)]
}

/**
 * Adónde va lo que se añade: "Añadir a hoy", "Añadir a mañana", "Añadir al jueves 8", "Añadir a la
 * bandeja" · "Add to today", "Add to Thursday 8", "Add to inbox".
 */
export function addLabel(date: IsoDate | null, today: IsoDate): string {
  const en = language() === 'en'
  if (date === null) return en ? 'Add to inbox' : 'Añadir a la bandeja'
  if (date === today) return en ? 'Add to today' : 'Añadir a hoy'
  if (date === addDays(today, 1)) return en ? 'Add to tomorrow' : 'Añadir a mañana'
  return en ? `Add to ${dayNameLong(date)} ${dayNumber(date)}` : `Añadir al ${dayNameLong(date)} ${dayNumber(date)}`
}
