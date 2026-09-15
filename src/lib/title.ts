import { fold } from './normalize'

export interface Span {
  start: number
  end: number
}

/**
 * Lo que abre una frase dictada y no es la tarea: muletillas, peticiones ("recuérdame que",
 * "me gustaría que me recordaras") y verbos de ir o tener delante de lo importante
 * ("tengo que acudir a una cena" → "cena"). Se busca sobre el texto sin tildes ni mayúsculas.
 */
const LEADING = new RegExp(
  `^(?:${[
    'bueno',
    'vale',
    'venga',
    'oye',
    'mira',
    'pues',
    // Solo con coma o punto detrás: "nada, comprar pan", no "nada 30 largos".
    'nada(?=[,.])',
    'vamos a ver',
    'a ver',
    'eh+',
    'hola',
    'ok(?:ay)?',
    'recuerdame(?: que)?',
    'recordarme(?: que)?',
    'recordar que',
    'me recuerdas(?: que)?',
    '(?:me )?(?:puedes|podrias) recordar(?:me)?(?: que)?',
    'acuerdate de(?: que)?',
    'acordarme de(?: que)?',
    'no te olvides de(?: que)?',
    'que no se me olvide(?: que)?',
    'apunta(?:me)?(?: que)?',
    'anota(?:me)?(?: que)?',
    'anade',
    'anadir',
    'nueva tarea',
    'crea(?:r)? (?:una )?tarea(?: para)?',
    '(?:me gustaria|quiero|necesito)(?: que)?(?: me)?(?: lo| la)? (?:recordaras|recordases|recuerdes|avises|avisaras|avisases)(?: que)?',
    'tengo que',
    'tenia que',
    'tendria que',
    'hay que',
    '(?:tengo|hay|es) (?:una?|el|la|los|las)',
    'tengo(?! que$)',
    // "ir a correos a mandar un paquete": lo que cuenta es lo que se va a hacer.
    '(?:ir|voy|vamos|pasar|pasarme) (?:a|al|por) [a-z]+(?: [a-z]+)? a(?= [a-z]+(?:ar|er|ir)(?:me|te|se|lo|la)?(?![a-z]))',
    '(?:ir|voy|vamos|acudir|asistir) (?:a (?:una?|la|las|los|el)|al|a)',
  ].join('|')})[,.:;]?\\s+`,
)

/** "he quedado con Pedro para cenar" → "cenar con Pedro". "para que revise…" no es una actividad. */
const MEETING = /^(?:he )?quedado con (.+?) para (?!que )(.+)$/d

const CONNECTORS = /^(?:(?:y|a|el|la|de|para|,)\s+)+|(?:\s+(?:y|a|el|la|de|para|,))+$/i
const EDGE_PUNCTUATION = /^[,.;:]+|[,.;:]+$/g
/** "¿Me recuerdas llamar a Ana?": pregunta entera, con lo de dentro aparte. */
const QUESTION = /^[¿¡]\s*([^¿¡?!]+?)\s*[?!]*$/

function stripLeading(title: string): string {
  const folded = fold(title)
  const meeting = MEETING.exec(folded)
  const who = meeting?.indices?.[1]
  const what = meeting?.indices?.[2]
  if (who && what) return `${title.slice(what[0], what[1])} con ${title.slice(who[0], who[1])}`
  const lead = LEADING.exec(folded)
  return lead && lead[0].length < title.length ? title.slice(lead[0].length) : title
}

/** Si la pregunta era la petición ("¿puedes recordarme…?"), los signos sobran; si no, se quedan. */
function stripRequest(title: string): string {
  const inner = QUESTION.exec(title)?.[1]
  if (!inner) return stripLeading(title)
  const unprefixed = stripLeading(inner)
  return unprefixed === inner ? title : unprefixed
}

export const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1)

/** Quita los signos que envuelven una pregunta entera: "¿llamar a Ana?" → "llamar a Ana". */
export const unwrapQuestion = (text: string) => QUESTION.exec(text)?.[1] ?? text

/** "¿Puedes recordarme…?" es una petición; "¿Qué le regalo a Ana?" es la tarea misma. */
export function isRequestQuestion(text: string): boolean {
  const inner = QUESTION.exec(text)?.[1]
  return inner !== undefined && stripLeading(inner) !== inner
}

/**
 * Quita del texto original los tramos reconocidos (fechas, horas, avisos) y lo que sobra
 * alrededor. Lo escrito conserva su mayúscula inicial o no; solo se pone mayúscula cuando se
 * ha recortado una muletilla ("recuérdame llamar…" → "Llamar…").
 */
export function cleanTitle(original: string, spans: readonly Span[]): string {
  const sorted = [...spans].sort((a, b) => b.start - a.start)
  const cut = sorted.reduce((text, span) => `${text.slice(0, span.start)} ${text.slice(span.end)}`, original)

  let title = cut
    .replace(/\s+/g, ' ')
    .replace(/\s+([,.;:?!])/g, '$1')
    .replace(/([¿¡])\s+/g, '$1')
    .trim()
  let stripped = false
  let previous = ''
  while (previous !== title) {
    previous = title
    // La muletilla va antes que los conectores: si no, "a ver" perdería la "a".
    const trimmed = title.replace(EDGE_PUNCTUATION, '').trim()
    const unprefixed = stripRequest(trimmed)
    stripped ||= unprefixed !== trimmed
    title = unprefixed.replace(CONNECTORS, '').replace(EDGE_PUNCTUATION, '').trim()
  }
  return stripped ? capitalize(title) : title
}
