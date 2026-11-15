import { pick } from '../../lib/i18n'

const NAME_KEY = 'tasks:member-name'

/** El último nombre con el que entraste en una cesta: la siguiente vez ya está escrito. */
export function memberName(): string {
  try {
    return localStorage.getItem(NAME_KEY) ?? ''
  } catch {
    return ''
  }
}

export function rememberMemberName(name: string): void {
  try {
    localStorage.setItem(NAME_KEY, name.trim().slice(0, 40))
  } catch {
    // Sin almacenamiento, se pregunta otra vez.
  }
}

/** Qué decir cuando falla algo de vincular o compartir. */
export function errorText(error: unknown): string {
  const status = typeof error === 'object' && error !== null && 'status' in error ? (error as { status: unknown }).status : null
  if (status === 403) return pick({ es: 'La invitación ha caducado o ya se usó. Pide otra.', en: 'The invitation has expired or was already used. Ask for a new one.' })
  if (status === 404) return pick({ es: 'Eso ya no existe.', en: 'That no longer exists.' })
  if (status === 429) return pick({ es: 'Demasiados intentos. Prueba en un rato.', en: 'Too many tries. Try again in a while.' })
  return pick({ es: 'No se ha podido. Comprueba la conexión.', en: 'Couldn’t do it. Check your connection.' })
}
