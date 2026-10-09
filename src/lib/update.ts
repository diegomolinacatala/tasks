/**
 * Avisar de que hay una versión nueva en la App Store (solo en el iPhone: la PWA se actualiza sola). La
 * versión publicada sale de la búsqueda pública de iTunes (`AppStoreVersion.swift`); aquí, compararla con
 * la instalada y decidir si se avisa. Cada versión se ofrece hasta que se actualiza o se dice "Ahora no".
 */

export interface StoreRelease {
  version: string
  /** Las novedades de esa versión, como se escribieron en App Store Connect, línea a línea. */
  notes: string[]
  /** La página de la app en la App Store. */
  url: string
}

export interface StoreCheck {
  installed: string
  release: StoreRelease | null
}

/** La página de la App Store si la búsqueda no la da. */
export const APP_STORE_URL = 'https://apps.apple.com/app/id6812776586'
/** Novedades que caben en el aviso; el resto, en la App Store. */
const MAX_NOTES = 6
const VERSION = /^\d+(\.\d+){0,3}$/

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null

/** `1.10` es mayor que `1.9`; `1.6` igual que `1.6.0`. */
export function compareVersions(a: string, b: string): number {
  const left = a.split('.').map(Number)
  const right = b.split('.').map(Number)
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    const diff = (left[index] ?? 0) - (right[index] ?? 0)
    if (diff !== 0) return Math.sign(diff)
  }
  return 0
}

/** Las novedades como lista: sin viñetas ni líneas vacías. */
export function releaseNotes(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s*[•\-*·]\s*/, '').trim())
    .filter(Boolean)
    .slice(0, MAX_NOTES)
}

/** Lo que llega de Swift, validado. Sin una versión que se entienda, no hay nada que ofrecer. */
export function parseStoreCheck(raw: unknown): StoreCheck {
  if (!isObject(raw)) return { installed: '', release: null }
  const installed = typeof raw.installed === 'string' ? raw.installed.trim() : ''
  const version = typeof raw.version === 'string' ? raw.version.trim() : ''
  if (!VERSION.test(version)) return { installed, release: null }
  const url = typeof raw.url === 'string' && raw.url.startsWith('https://apps.apple.com/') ? raw.url : APP_STORE_URL
  const notes = typeof raw.notes === 'string' ? releaseNotes(raw.notes) : []
  return { installed, release: { version, notes, url } }
}

/** Se ofrece si la publicada es más nueva que la instalada y no se dijo "Ahora no" a esa misma. */
export function offeredUpdate(check: StoreCheck, dismissed: string | null): StoreRelease | null {
  const { installed, release } = check
  if (!release || !VERSION.test(installed)) return null
  if (compareVersions(release.version, installed) <= 0) return null
  return release.version === dismissed ? null : release
}

/** La tienda y el idioma de las novedades, según el idioma de la app. */
export function storeLocale(language: 'es' | 'en', region: string | null): { country: string; lang: string } {
  const country = region && /^[a-z]{2}$/i.test(region) ? region.toLowerCase() : language === 'en' ? 'us' : 'es'
  return { country, lang: language === 'en' ? 'en_us' : 'es_es' }
}
