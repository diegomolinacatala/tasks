import type { Place, PlaceTrigger } from '../types'
import type { NormalizedText } from './normalize'
import { originalSpan } from './normalize'
import { capitalize } from './title'
import { findPlace, matchPlace, placeKeys } from './places'

/** "al llegar a", "cuando pase por", "nada más llegar a", "cuando esté en", "cuando vuelva a casa". */
const ARRIVE = 'llegar|llegue|llego|pasar|pase|paso|estar|este|ir|vaya|entrar|entre|volver|vuelva|vuelvo|regresar|regrese|regreso'
/** "al salir de", "cuando salga del", "cuando me vaya de", "al irme del", "al marcharme de". */
const LEAVE = 'salir|salga|salgo|irme|me vaya|me voy|marcharme|me marche|me marcho|salgamos|irnos|nos vayamos'
/** Palabras que no pueden abrir ni continuar un nombre de lugar sin guardar. */
const STOP =
  '(?:de|del|que|para|y|a|al|por|con|en|antes|despues|hoy|manana|la|el|los|las|mi|recuerdame|avisame|recordar|avisar)(?![a-z0-9])'
const GENERIC = `(?!${STOP})[a-z0-9]+(?: (?!${STOP})[a-z0-9]+){0,3}`
/** Tras el lugar: "…Mercadona de comprar pan", "…universidad que tengo que…". "casa de Pepe" no. */
const CONNECTOR = /^ (?:de que|que|de(?= [a-z]+(?:ar|er|ir)(?:me|te|se|lo|la|le)?(?![a-z0-9])))(?![a-z0-9])/

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

export interface PlacePhrase {
  on: PlaceTrigger
  /** Lugar guardado al que se refiere, o `null` si es uno nuevo. */
  place: Place | null
  name: string
  /** Longitud del tramo reconocido en el texto normalizado. */
  length: number
}

/** Los nombres guardados (y sus otros nombres) como alternativas de una expresión, los largos primero. */
export const savedNames = (places: readonly Place[]): string[] => placeKeys(places).map(escape)

/**
 * Expresión del aviso de lugar. `remindVerb`: la petición opcional delante ("recuérdame"), que
 * forma parte del tramo. Los lugares guardados (con sus otros nombres) se prueban antes que un nombre suelto.
 */
export function placePhraseRegex(remindVerb: string, places: readonly Place[]): RegExp {
  const names = savedNames(places)
  const target = names.length ? `(?:(${names.join('|')})|(${GENERIC}))` : `(?:()(${GENERIC}))`
  return new RegExp(
    // Llegar es "a", "por" o "en" un sitio; salir o irse, "de" él ("cuando me vaya a Mercadona" no es salir).
    `(?<![a-z0-9])(?:${remindVerb}(?: que)? )?(?:al|cuando|en cuanto|nada mas) ` +
      `(?:(${ARRIVE}) (?:a|al|por|en)|(${LEAVE}) (?:de|del))(?: (la|el|los|las|mi))? ${target}(?![a-z0-9])`,
    'g',
  )
}

const isCapitalized = (char: string | undefined) => Boolean(char) && char !== char?.toLowerCase()

/**
 * Convierte un resultado de `placePhraseRegex` en el lugar dicho. Un nombre sin guardar se queda
 * con su primera palabra y las siguientes que vayan en mayúscula en el original ("El Corte
 * Inglés"): en minúsculas no hay forma de saber dónde acaba ("banco sacar dinero").
 */
export function readPlacePhrase(
  match: RegExpExecArray,
  normalized: NormalizedText,
  original: string,
  places: readonly Place[],
  connector: RegExp = CONNECTOR,
): PlacePhrase {
  const [full, , leave, article, saved, generic = ''] = match
  const on: PlaceTrigger = leave ? 'leave' : 'arrive'
  const withConnector = (end: number) => end + (connector.exec(normalized.text.slice(match.index + end))?.[0].length ?? 0)

  if (saved) {
    const place = findPlace(places, saved)
    return { on, place, name: place?.name ?? saved, length: withConnector(full.length) }
  }

  const genericStart = match.index + full.length - generic.length
  const words = [...generic.matchAll(/[a-z0-9]+/g)]
  let kept = words[0] ? words[0].index + words[0][0].length : generic.length
  for (const word of words.slice(1)) {
    const at = originalSpan(normalized, genericStart + word.index, genericStart + word.index + 1).start
    if (!isCapitalized(original[at])) break
    kept = word.index + word[0].length
  }

  const articleStart = article ? genericStart - article.length - 1 : genericStart
  const articleAt = originalSpan(normalized, articleStart, articleStart + 1).start
  const nameStart = article && isCapitalized(original[articleAt]) ? articleStart : genericStart
  const span = originalSpan(normalized, nameStart, genericStart + kept)
  const name = capitalize(original.slice(span.start, span.end))
  // Escrito o transcrito con otra grafía ("Carrefur"): si se parece mucho a uno guardado, es ese.
  const close = matchPlace(places, name)
  return { on, place: close, name: close?.name ?? name, length: withConnector(full.length - generic.length + kept) }
}
