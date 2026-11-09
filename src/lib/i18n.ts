/**
 * Idioma de la interfaz: español o inglés. Se elige en Ajustes (o sigue al sistema) y vale para todo
 * lo que la app escribe: pantallas, fechas, avisos, lo que dice Siri y el analizador de lo escrito.
 *
 * El idioma vigente vive aquí y no en cada llamada: la lógica pura (`date.ts`, `schedule.ts`,
 * `parse.ts`…) lo consulta al componer un texto. La web lo fija al pintar (`LanguageProvider`) y
 * `headless.js`, al empezar cada petición de Siri. Cada módulo guarda sus textos en los dos idiomas,
 * junto al código que los usa (`pick`).
 */

import type { LanguageSetting } from '../types'

export type { LanguageSetting }

export type Language = Exclude<LanguageSetting, 'auto'>

export const LANGUAGE_SETTINGS: readonly LanguageSetting[] = ['auto', 'es', 'en']

let current: Language = 'es'

export const language = (): Language => current

export function setLanguage(next: Language): void {
  current = next
}

export const isLanguageSetting = (value: unknown): value is LanguageSetting =>
  LANGUAGE_SETTINGS.includes(value as LanguageSetting)

/**
 * El primero de los idiomas del sistema que la app sabe hablar. Si no habla ninguno (francés,
 * alemán…), inglés: lo entiende más gente que el español.
 */
export function systemLanguage(preferred: readonly string[]): Language {
  for (const tag of preferred) {
    const base = tag.toLowerCase().split(/[-_]/)[0]
    if (base === 'es' || base === 'en') return base
  }
  return 'en'
}

export const resolveLanguage = (setting: LanguageSetting, preferred: readonly string[]): Language =>
  setting === 'auto' ? systemLanguage(preferred) : setting

/** Los idiomas del navegador (en la app de iPhone, los de iOS). Fuera del navegador, ninguno. */
export function deviceLanguages(): string[] {
  if (typeof navigator === 'undefined') return []
  if (navigator.languages?.length) return [...navigator.languages]
  return navigator.language ? [navigator.language] : []
}

/** Lo de cada idioma: `pick({ es: 'Hoy', en: 'Today' })`. */
export const pick = <T extends Readonly<Record<Language, unknown>>>(table: T): T[Language] => table[current]

/** Etiqueta para `Intl`. */
export const locale = (): string => (current === 'en' ? 'en-US' : 'es-ES')

/** `1 tarea`, `3 tareas`: la forma según la cantidad. */
export const plural = (count: number, one: string, many: string): string => `${count} ${count === 1 ? one : many}`
