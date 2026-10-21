import type { IsoDate } from '../types'
import { addDays, dayNameLong, dayNameShort, dayNumber, relativeLabel } from './date'
import type { Language } from './i18n'
import { language, pick } from './i18n'

/** Un sitio donde dejar lo escrito en el compositor: "Hoy", "Mañana", "Jue 2", "Bandeja" o una sección. */
export interface ComposeTarget {
  /** Único entre los destinos: el día y, si la hay, la sección. */
  key: string
  label: string
  date: IsoDate | null
  /** Una sección del día (el + de una sección en la Agenda). */
  sectionId?: string
  sectionName?: string
}

const keyOf = (date: IsoDate | null, sectionId?: string) => `${date ?? 'none'}${sectionId ? `#${sectionId}` : ''}`

const WORDS = {
  es: { today: 'Hoy', tomorrow: 'Mañana', none: 'Bandeja' },
  en: { today: 'Today', tomorrow: 'Tomorrow', none: 'Inbox' },
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
  // "Trabajo · hoy": la sección y el día en una sola píldora, para que no parezca otro día más.
  return [
    { key: keyOf(here, section.id), label: `${section.name} · ${current.label.toLowerCase()}`, date: here, sectionId: section.id, sectionName: section.name },
    ...targets,
  ]
}

/**
 * Adónde va lo que se añade: "Añadir a hoy", "Añadir a mañana", "Añadir al jueves 8", "Añadir a la
 * bandeja", "Añadir a Compra" · "Add to today", "Add to Thu, Oct 8", "Add to inbox", "Add to Groceries".
 */
export function addLabel(date: IsoDate | null, today: IsoDate, section?: string): string {
  const en = language() === 'en'
  if (section) return en ? `Add to ${section}` : `Añadir a ${section}`
  if (date === null) return en ? 'Add to inbox' : 'Añadir a la bandeja'
  if (date === today) return en ? 'Add to today' : 'Añadir a hoy'
  if (date === addDays(today, 1)) return en ? 'Add to tomorrow' : 'Añadir a mañana'
  // Un día que ya pasó: lo que se añada nace atrasado, y se dice.
  const past = date < today ? (en ? ' (past)' : ' (pasado)') : ''
  return en ? `Add to ${relativeLabel(date, today)}${past}` : `Añadir al ${dayNameLong(date)} ${dayNumber(date)}${past}`
}

interface ComposeExample {
  text: string
  /** Solo se entiende donde hay avisos por lugar (la app de iPhone): en la PWA se quedaría tal cual. */
  place?: true
}

// Cada una enseña una cosa que se entiende al escribir: día y hora, lugar, lo que dura, lo que se
// repite y un plazo. Cortas, para que quepan en la barra de un iPhone estrecho. Las que llevan a
// Carlota las pidió el usuario.
const EXAMPLES: Readonly<Record<Language, readonly ComposeExample[]>> = {
  es: [
    { text: 'Llamar a Carlota mañana a las 6' },
    { text: 'Sacar la basura al salir de casa', place: true },
    { text: 'Gimnasio de 7 a 8 de la tarde' },
    { text: 'Leer todas las noches' },
    { text: 'Renovar el DNI esta semana' },
    { text: 'Llamar a Raúl al moverme', place: true },
  ],
  en: [
    { text: 'Call Carlota tomorrow at 6pm' },
    { text: 'Buy milk when I leave work', place: true },
    { text: 'Gym tomorrow from 7 to 8pm' },
    { text: 'Read every night' },
    { text: 'Renew passport this week' },
    { text: 'Call Raúl when I move', place: true },
  ],
}

/**
 * Frases de ejemplo para la barra abierta y vacía, en orden (la primera es la que sale antes): que
 * escribiendo también se entiende el día, la hora, el sitio y lo demás, no solo dictando.
 */
export function composeExamples(withPlaces: boolean): readonly string[] {
  return pick(EXAMPLES)
    .filter((example) => withPlaces || !example.place)
    .map((example) => example.text)
}
