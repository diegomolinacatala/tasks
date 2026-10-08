import type { IsoDate } from '../types'
import { addDays, dayNameLong, dayNameShort, dayNumber } from './date'
import { language, pick } from './i18n'

/** Un sitio donde dejar lo escrito en el compositor: "Hoy", "Mañana", "Jue 2", "Sin fecha" o una sección. */
export interface ComposeTarget {
  /** Único entre los destinos: el día y, si la hay, la sección. */
  key: string
  label: string
  date: IsoDate | null
  /** Una sección del día (el + de una sección en la Agenda). */
  sectionId?: string
}

const keyOf = (date: IsoDate | null, sectionId?: string) => `${date ?? 'none'}${sectionId ? `#${sectionId}` : ''}`

const WORDS = {
  es: { today: 'Hoy', tomorrow: 'Mañana', none: 'Sin fecha' },
  en: { today: 'Today', tomorrow: 'Tomorrow', none: 'No date' },
} as const

const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1)

/**
 * Los destinos del compositor, en orden. El primero es donde se está mirando (`here`: el día
 * elegido en la Agenda, `null` en la Bandeja) y va elegido de entrada; detrás, los de siempre (hoy,
 * mañana y sin fecha), sin repetir el primero. Con `section` (se tocó el + de una sección), ella va
 * delante de todo: lo escrito cae en esa sección del día que se mira.
 */
export function composeTargets(here: IsoDate | null, today: IsoDate, section?: { id: string; name: string } | null): ComposeTarget[] {
  const words = pick(WORDS)
  const usual: ComposeTarget[] = [
    { key: keyOf(today), label: words.today, date: today },
    { key: keyOf(addDays(today, 1)), label: words.tomorrow, date: addDays(today, 1) },
    { key: keyOf(null), label: words.none, date: null },
  ]
  const current = usual.find((target) => target.date === here) ?? {
    key: keyOf(here),
    label: here ? `${capitalize(dayNameShort(here))} ${dayNumber(here)}` : words.none,
    date: here,
  }
  const targets = [current, ...usual.filter((target) => target.date !== here)]
  if (!section || here === null) return targets
  return [{ key: keyOf(here, section.id), label: section.name, date: here, sectionId: section.id }, ...targets]
}

/**
 * Adónde va lo que se añade: "Añadir a hoy", "Añadir a mañana", "Añadir al jueves 8", "Añadir a la
 * bandeja", "Añadir a Compra" · "Add to today", "Add to Thursday 8", "Add to inbox", "Add to Groceries".
 */
export function addLabel(date: IsoDate | null, today: IsoDate, section?: string): string {
  const en = language() === 'en'
  if (section) return en ? `Add to ${section}` : `Añadir a ${section}`
  if (date === null) return en ? 'Add to inbox' : 'Añadir a la bandeja'
  if (date === today) return en ? 'Add to today' : 'Añadir a hoy'
  if (date === addDays(today, 1)) return en ? 'Add to tomorrow' : 'Añadir a mañana'
  return en ? `Add to ${dayNameLong(date)} ${dayNumber(date)}` : `Añadir al ${dayNameLong(date)} ${dayNumber(date)}`
}
