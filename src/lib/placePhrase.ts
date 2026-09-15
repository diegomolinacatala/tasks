import type { Place, PlaceTrigger } from '../types'
import type { NormalizedText } from './normalize'
import { originalSpan } from './normalize'
import { capitalize } from './title'
import { placeKey } from './places'

/** "al llegar a", "cuando pase por", "nada más llegar a", "cuando esté en". */
const ARRIVE = 'llegar|llegue|llego|pasar|pase|paso|estar|este|ir|vaya|entrar|entre'
/** "al salir de", "cuando salga del". */
const LEAVE = 'salir|salga|salgo'
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

/**
 * Expresión del aviso de lugar. `remindVerb`: la petición opcional delante ("recuérdame"), que
 * forma parte del tramo. Los lugares guardados se prueban antes que un nombre suelto.
 */
export function placePhraseRegex(remindVerb: string, places: readonly Place[]): RegExp {
  const names = [...new Set(places.map((place) => escape(placeKey(place.name))).filter(Boolean))].sort(
    (a, b) => b.length - a.length,
  )
  const target = names.length ? `(?:(${names.join('|')})|(${GENERIC}))` : `(?:()(${GENERIC}))`
  return new RegExp(
    `(?<![a-z0-9])(?:${remindVerb} )?(?:al|cuando|en cuanto|nada mas) (?:(${ARRIVE})|(${LEAVE})) ` +
      `(?:a|al|por|de|del|en)(?: (la|el|los|las|mi))? ${target}(?![a-z0-9])`,
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
): PlacePhrase {
  const [full, , leave, article, saved, generic = ''] = match
  const on: PlaceTrigger = leave ? 'leave' : 'arrive'
  const withConnector = (end: number) => end + (CONNECTOR.exec(normalized.text.slice(match.index + end))?.[0].length ?? 0)

  if (saved) {
    const place = places.find((item) => placeKey(item.name) === saved) ?? null
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
  return { on, place: null, name, length: withConnector(full.length - generic.length + kept) }
}
