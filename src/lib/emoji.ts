import { language } from './i18n'

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

/** Lo mismo en inglés ("take creatine" → 💊). Palabras cortas con borde: "run" no está en "brunch". */
const HINTS_EN: readonly (readonly [RegExp, string])[] = [
  [/\bdogs?\b|puppy/, '🐕'],
  [/creatine|\bpills?\b|vitamin|\bmeds\b|medicine|medication|supplement|magnesium|omega/, '💊'],
  [/water the plants|plants|garden/, '🌿'],
  [/\bwater\b|hydrat/, '💧'],
  [/teeth|floss|brush/, '🪥'],
  [/shower/, '🚿'],
  [/sunscreen|skincare|moisturi/, '🧴'],
  [/coffee|breakfast/, '☕'],
  [/study|homework|revise|flashcards|spanish|english|french|language/, '📚'],
  [/\bread\b|reading|\bbooks?\b/, '📖'],
  [/journal|diary|\bwrite\b|writing/, '🖋️'],
  [/\bgym\b|workout|weights|lift|push-?ups|pull-?ups|training/, '🏋️'],
  [/\brun\b|running|\bjog/, '🏃'],
  [/\bswim|pool/, '🏊'],
  [/\bbike|cycling/, '🚴'],
  [/meditat|breath|stretch|yoga|mobility/, '🧘'],
  [/\bwalk|steps/, '🚶'],
  [/sleep|\bbed\b|\bnap\b/, '🌙'],
  [/wake up|get up/, '🌅'],
  [/piano|guitar|violin|music|\bsing/, '🎼'],
  [/\bdraw|paint/, '🎨'],
  [/\bcook|meal prep/, '🍳'],
  [/fruit|veggies|vegetables|salad/, '🍎'],
  [/laundry/, '🧺'],
  [/clean|tidy|dishes|sweep|vacuum/, '🧹'],
  [/e-?mail|\bmail\b|inbox/, '✉️'],
  [/\bcall\b|phone/, '📞'],
  [/\bsave\b|savings|budget|expenses|money/, '💰'],
  [/weigh/, '⚖️'],
  [/\bpray|gratitude|grateful/, '🙏'],
  [/\bcode\b|coding|program|\bwork\b/, '💻'],
]

const plain = (text: string) =>
  text
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()

/**
 * El emoji que le pega a un nombre ("Tomar creatina" → 💊, "Walk the dog" → 🐕), o `null` si no se
 * reconoce nada. Primero en el idioma de la app.
 */
export function suggestEmoji(title: string): string | null {
  const text = plain(title)
  const hints = language() === 'en' ? [...HINTS_EN, ...HINTS] : [...HINTS, ...HINTS_EN]
  return hints.find(([pattern]) => pattern.test(text))?.[1] ?? null
}
