/**
 * El emoji de una rutina: su seña en la fila, en el horario y en el widget (donde sustituye a las
 * iniciales). Se guarda uno solo, tal cual lo da el teclado; la app lo pinta entonado con el papel
 * (`--emoji-tone` en `tokens.css`) para que no desentone.
 */

/** Una bandera, una tecla (`1️⃣`) o un pictograma con sus variantes (tono de piel, uniones con ZWJ). */
const EMOJI =
  /\p{Regional_Indicator}{2}|[0-9#*]️?⃣|\p{Extended_Pictographic}(?:️|\p{Emoji_Modifier})?(?:‍\p{Extended_Pictographic}(?:️|\p{Emoji_Modifier})?)*/u

/** El primer emoji del texto, o `null` si no hay ninguno. Sirve para sanear y para leer lo tecleado. */
export function cleanEmoji(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  return EMOJI.exec(raw)?.[0] ?? null
}

/**
 * Los del selector: cosas de casa y de cada día, que entonadas quedan como un grabado. Son 28: con
 * "sin emoji" y el hueco de "otro" llenan justo cuatro filas de ocho.
 */
export const ROUTINE_EMOJIS: readonly string[] = [
  '☕',
  '💊',
  '💧',
  '📖',
  '🏃',
  '🏋️',
  '🧘',
  '🚶',
  '🌅',
  '🌙',
  '🪥',
  '🚿',
  '📚',
  '🖋️',
  '🎼',
  '🌿',
  '🐕',
  '🍳',
  '🍎',
  '🧹',
  '✉️',
  '💰',
  '🧴',
  '🚴',
  '🙏',
  '💻',
  '🎨',
  '🧠',
]

/** De lo más concreto a lo más general: "pasear al perro" es un perro antes que un paseo. */
const HINTS: readonly (readonly [RegExp, string])[] = [
  [/perr/, '🐕'],
  [/creatina|pastilla|vitamina|medica|medicina|suplemento|magnesio|omega/, '💊'],
  [/agua|hidrat/, '💧'],
  [/dientes|hilo dental|cepill/, '🪥'],
  [/ducha|duchar/, '🚿'],
  [/crema|protector solar|skincare/, '🧴'],
  [/cafe|desayun/, '☕'],
  [/estudi|repas|deberes|apuntes|ingles|idioma/, '📚'],
  [/leer|lectura|libro/, '📖'],
  [/escribir|diario/, '🖋️'],
  [/gimnasio|gym|pesas|entren|fuerza|flexiones|dominadas/, '🏋️'],
  [/correr|trotar|running/, '🏃'],
  [/nadar|piscina/, '🏊'],
  [/bici|pedal/, '🚴'],
  [/medit|respira|estir|yoga|movilidad/, '🧘'],
  [/andar|caminar|pase|pasos/, '🚶'],
  [/dormir|acostar|cama|siesta/, '🌙'],
  [/madrug|despertar|levantar/, '🌅'],
  [/piano|guitarra|violin|musica|cantar/, '🎼'],
  [/dibuj|pintar/, '🎨'],
  [/regar|plantas|huerto/, '🌿'],
  [/cocin|tupper/, '🍳'],
  [/fruta|verdura|ensalada/, '🍎'],
  [/lavadora|colada|tender/, '🧺'],
  [/limpi|ordenar|recoger|fregar|barrer/, '🧹'],
  [/correo|email|mail/, '✉️'],
  [/llamar|telefon/, '📞'],
  [/ahorr|gastos|cuentas|dinero/, '💰'],
  [/pesarme|bascula/, '⚖️'],
  [/rezar|orar|gratitud|agradec/, '🙏'],
  [/program|codigo|trabaj/, '💻'],
]

const plain = (text: string) =>
  text
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()

/** El emoji que le pega a un nombre ("Tomar creatina" → 💊), o `null` si no se reconoce nada. */
export function suggestEmoji(title: string): string | null {
  const text = plain(title)
  return HINTS.find(([pattern]) => pattern.test(text))?.[1] ?? null
}
