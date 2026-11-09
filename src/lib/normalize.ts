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

/** También el apóstrofo curvo de los teclados del iPhone (`’` → `'`): "don’t" se busca como "don't". */
const ACCENTS: Record<string, string> = { á: 'a', à: 'a', ä: 'a', é: 'e', è: 'e', í: 'i', ó: 'o', ú: 'u', ü: 'u', ñ: 'n', '’': "'" }

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

/** Números en palabras de un idioma y la expresión que los encuentra. */
export interface NumberWords {
  words: Readonly<Record<string, string>>
  regex: RegExp
}

// Las alternativas más largas primero, para que "veinticinco" no se quede en "veinte".
const numberWords = (words: Record<string, string>): NumberWords => ({
  words,
  regex: new RegExp(
    `(?<![a-z0-9])(?:${Object.keys(words)
      .sort((a, b) => b.length - a.length)
      .join('|')})(?![a-z0-9])`,
    'g',
  ),
})

export const SPANISH_NUMBERS = numberWords(NUMBER_WORDS)

const ONES = ['one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine']
const TENS: [string, number][] = [
  ['twenty', 20],
  ['thirty', 30],
  ['forty', 40],
  ['fifty', 50],
]

/** "one" … "fifty-nine", con guion o sin él ("forty five"). "a" y "an" no: son artículos. */
export const ENGLISH_NUMBERS = numberWords({
  ...Object.fromEntries(ONES.map((name, index) => [name, String(index + 1)])),
  ten: '10',
  eleven: '11',
  twelve: '12',
  thirteen: '13',
  fourteen: '14',
  fifteen: '15',
  sixteen: '16',
  seventeen: '17',
  eighteen: '18',
  nineteen: '19',
  sixty: '60',
  ninety: '90',
  ...Object.fromEntries(
    TENS.flatMap(([ten, value]) => [
      [ten, String(value)],
      ...ONES.flatMap((one, index) => [
        [`${ten}-${one}`, String(value + index + 1)],
        [`${ten} ${one}`, String(value + index + 1)],
      ]),
    ]),
  ),
})

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

export function normalizeText(input: string, numbers: NumberWords = SPANISH_NUMBERS): NormalizedText {
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
  for (const match of folded.matchAll(numbers.regex)) {
    copy(cursor, match.index)
    const end = match.index + match[0].length
    for (const digit of numbers.words[match[0]] ?? match[0]) {
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
