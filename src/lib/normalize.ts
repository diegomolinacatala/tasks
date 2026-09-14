/**
 * Texto preparado para buscar patrones en español: minúsculas, sin tildes y con los números
 * escritos en palabras ("cinco", "diez") convertidos a dígitos. Como las longitudes cambian,
 * se guarda para cada carácter de dónde viene en el texto original.
 */
export interface NormalizedText {
  text: string
  /** Posición inicial en el original de cada carácter de `text`. */
  starts: number[]
  /** Posición final (exclusiva) en el original de cada carácter de `text`. */
  ends: number[]
}

const ACCENTS: Record<string, string> = { á: 'a', à: 'a', ä: 'a', é: 'e', è: 'e', í: 'i', ó: 'o', ú: 'u', ü: 'u', ñ: 'n' }

const NUMBER_WORDS: Record<string, string> = {
  'cuarenta y cinco': '45',
  veinticinco: '25',
  veintitres: '23',
  veintidos: '22',
  veintiuno: '21',
  diecinueve: '19',
  dieciocho: '18',
  diecisiete: '17',
  dieciseis: '16',
  cincuenta: '50',
  cuarenta: '40',
  treinta: '30',
  veinte: '20',
  quince: '15',
  catorce: '14',
  trece: '13',
  doce: '12',
  once: '11',
  diez: '10',
  nueve: '9',
  ocho: '8',
  siete: '7',
  seis: '6',
  cinco: '5',
  cuatro: '4',
  tres: '3',
  dos: '2',
  una: '1',
  uno: '1',
  un: '1',
}

// Las alternativas más largas primero, para que "veinticinco" no se quede en "veinte".
const RE_NUMBER_WORD = new RegExp(
  `(?<![a-z0-9])(?:${Object.keys(NUMBER_WORDS)
    .sort((a, b) => b.length - a.length)
    .join('|')})(?![a-z0-9])`,
  'g',
)

/** Minúsculas sin tildes, unidad a unidad UTF-16: misma longitud que el original. */
export function fold(input: string): string {
  let out = ''
  for (let i = 0; i < input.length; i++) {
    const char = input[i] ?? ''
    const lower = char.toLowerCase()
    out += lower.length === 1 ? (ACCENTS[lower] ?? lower) : char
  }
  return out
}

export function normalizeText(input: string): NormalizedText {
  const folded = fold(input)
  let text = ''
  const starts: number[] = []
  const ends: number[] = []

  const copy = (from: number, to: number) => {
    for (let i = from; i < to; i++) {
      text += folded[i]
      starts.push(i)
      ends.push(i + 1)
    }
  }

  let cursor = 0
  for (const match of folded.matchAll(RE_NUMBER_WORD)) {
    copy(cursor, match.index)
    const end = match.index + match[0].length
    for (const digit of NUMBER_WORDS[match[0]] ?? match[0]) {
      text += digit
      starts.push(match.index)
      ends.push(end)
    }
    cursor = end
  }
  copy(cursor, folded.length)

  return { text, starts, ends }
}

/** Convierte un tramo de `text` al tramo equivalente del original. */
export function originalSpan(normalized: NormalizedText, start: number, end: number): { start: number; end: number } {
  return { start: normalized.starts[start] ?? start, end: normalized.ends[end - 1] ?? end }
}
