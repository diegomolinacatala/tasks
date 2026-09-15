/**
 * Evalúa el dictado contra Workers AI real: frase → IA del Worker → validación del móvil.
 *
 * Cada frase gasta ~140 neuronas y el plan gratuito da 10.000 al día, compartidas con la app:
 * una pasada completa deja el dictado de producción sin IA hasta las 00:00 UTC. Por eso hay
 * que pedirla expresamente con `--all`.
 *
 *   npm run eval -- --local            # solo el analizador local: no gasta cuota
 *   npm run eval -- cena vuelo         # esos casos con la IA
 *   npm run eval -- --all              # todos los casos con la IA
 *   EVAL_MODEL=@cf/... npm run eval -- cena
 */
import { getPlatformProxy } from 'wrangler'
import { isoOfInstant, timeOfInstant, toInstant } from '../../src/lib/date'
import { draftsFromInterpreted } from '../../src/lib/interpret'
import type { ParsedTask } from '../../src/lib/parse'
import { parseSpoken } from '../../src/lib/parse'
import { workersAiInterpreter } from '../src/interpret'
import type { EvalCase, ExpectedTask } from './cases'
import { CASES, NOW, TODAY } from './cases'

const CONCURRENCY = 4
const MINUTE = 60_000

/** Comparación de títulos sin tildes, puntuación ni artículos: "Entregar informe" vale igual. */
const fold = (text: string) =>
  text
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[.,;:!?¡¿]+/g, '')
    .replace(/(?<![a-z])(?:el|la|los|las|un|una|unos|unas)(?![a-z])/g, '')
    .replace(/\s+/g, ' ')
    .trim()

const stamp = (ms: number) => `${isoOfInstant(ms)} ${timeOfInstant(ms)}`

function instants(task: ParsedTask): string[] {
  return task.reminders
    .flatMap((reminder) => {
      if (reminder.kind === 'at') return [stamp(reminder.at)]
      if (reminder.kind === 'place' || !task.date || !task.time) return []
      return [stamp(toInstant(task.date, task.time) - reminder.minutes * MINUTE)]
    })
    .sort()
}

const options = <T>(value: T | T[]): T[] => (Array.isArray(value) ? value : [value])

/** Diferencias campo a campo; vacío si la tarea es correcta. */
function diff(expected: ExpectedTask, actual: ParsedTask | undefined): string[] {
  if (!actual) return ['falta la tarea']
  const errors: string[] = []
  if (!options(expected.title).some((title) => fold(title) === fold(actual.title))) {
    errors.push(`título «${actual.title}» ≠ «${options(expected.title)[0]}»`)
  }
  if (actual.date !== expected.date) errors.push(`fecha ${actual.date} ≠ ${expected.date}`)
  if (!options(expected.time).includes(actual.time)) errors.push(`hora ${actual.time} ≠ ${options(expected.time)[0]}`)
  const got = instants(actual)
  const want = [...expected.reminders].sort()
  if (got.join('|') !== want.join('|')) errors.push(`avisos [${got.join(', ')}] ≠ [${want.join(', ')}]`)
  // El banco no tiene lugares guardados: todo lugar dicho llega como lugar nuevo.
  const place = actual.newPlace
  const expectedPlace = expected.place
  const placeOk = expectedPlace
    ? place?.on === expectedPlace.on && options(expectedPlace.name).some((name) => fold(name) === fold(place.name))
    : !place
  if (!placeOk) {
    const show = (value?: { name: string | string[]; on: string }) => (value ? `${options(value.name)[0]} (${value.on})` : 'ninguno')
    errors.push(`lugar ${show(place)} ≠ ${show(expectedPlace)}`)
  }
  return errors
}

type Field = 'title' | 'date' | 'time' | 'reminders' | 'place'

function grade(item: EvalCase, actual: ParsedTask[]) {
  const attempts = [item.expected, ...(item.alternatives ?? [])].map((expected) => gradeAgainst(expected, actual))
  return attempts.find((attempt) => attempt.ok) ?? attempts[0]!
}

function gradeAgainst(expectedTasks: ExpectedTask[], actual: ParsedTask[]) {
  const errors: string[] = []
  if (actual.length !== expectedTasks.length) errors.push(`${actual.length} tareas ≠ ${expectedTasks.length}`)
  const fields: Record<Field, boolean> = { title: true, date: true, time: true, reminders: true, place: true }
  expectedTasks.forEach((expected, index) => {
    const matched = actual.find((task) => options(expected.title).some((t) => fold(t) === fold(task.title))) ?? actual[index]
    const taskErrors = diff(expected, matched)
    for (const error of taskErrors) {
      if (error.startsWith('título') || error.startsWith('falta')) fields.title = false
      if (error.startsWith('fecha')) fields.date = false
      if (error.startsWith('hora')) fields.time = false
      if (error.startsWith('avisos') || error.startsWith('falta')) fields.reminders = false
      if (error.startsWith('lugar') || error.startsWith('falta')) fields.place = false
    }
    errors.push(...taskErrors)
  })
  return { ok: errors.length === 0, errors, fields }
}

async function pool<T, R>(items: T[], limit: number, work: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length)
  let next = 0
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next++
      results[index] = await work(items[index]!)
    }
  })
  await Promise.all(workers)
  return results
}

const percentile = (values: number[], p: number) => {
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))] ?? 0
}

type Grade = ReturnType<typeof grade>

function report(rows: { item: EvalCase; grade: Grade; note: string }[], label: string) {
  for (const { item, grade: result, note } of rows) {
    console.log(`${result.ok ? '✓' : '✗'} ${item.id.padEnd(24)} ${note}`)
    for (const error of result.errors) console.log(`    ${error}`)
  }
  const total = rows.length
  const count = (pick: (result: Grade) => boolean) => rows.filter((row) => pick(row.grade)).length
  console.log(`\n${label}: ${count((r) => r.ok)}/${total} correctas`)
  for (const field of ['title', 'date', 'time', 'reminders', 'place'] as const) {
    console.log(`    ${field.padEnd(10)} ${count((r) => r.fields[field])}/${total}`)
  }
}

function runLocal(cases: EvalCase[]) {
  const rows = cases.map((item) => {
    const spoken = parseSpoken(item.text, toInstant(TODAY, item.now ?? NOW))
    return { item, grade: grade(item, spoken.title ? [spoken] : []), note: '' }
  })
  report(rows, 'analizador local')
}

async function runAi(cases: EvalCase[]) {
  const model = process.env.EVAL_MODEL
  const proxy = await getPlatformProxy<{ AI: Ai }>({ configPath: 'eval/wrangler.toml', persist: false })
  const interpreter = workersAiInterpreter(proxy.env.AI, model ? { model } : {})

  const rows = await pool(cases, CONCURRENCY, async (item) => {
    const clock = item.now ?? NOW
    const started = Date.now()
    let interpreted: unknown = null
    let failure = ''
    try {
      interpreted = await interpreter.interpret(item.text, { today: TODAY, now: clock })
    } catch (error) {
      failure = `  ERROR ${error instanceof Error ? error.message : String(error)}`
    }
    const ms = Date.now() - started
    const drafts = draftsFromInterpreted(interpreted, toInstant(TODAY, clock)) ?? []
    return { item, ms, grade: grade(item, drafts), note: `${String(ms).padStart(5)} ms${failure}` }
  })
  await proxy.dispose()

  report(rows, `IA (${model ?? 'modelo por defecto'})`)
  const times = rows.map((row) => row.ms)
  console.log(`latencia: p50 ${percentile(times, 50)} ms · p95 ${percentile(times, 95)} ms`)
}

async function main() {
  const args: string[] = process.argv.slice(2)
  const ids = args.filter((arg) => !arg.startsWith('--'))
  const unknown = ids.filter((id) => !CASES.some((item) => item.id === id))
  const cases = ids.length ? CASES.filter((item) => ids.includes(item.id)) : CASES
  const usage = `Uso: npm run eval -- --local | <ids> | --all (${CASES.length} frases ≈ ${CASES.length * 140} neuronas)`

  if (unknown.length) {
    console.error(`Casos desconocidos: ${unknown.join(', ')}`)
    process.exitCode = 1
  } else if (args.includes('--local')) {
    runLocal(cases)
  } else if (!ids.length && !args.includes('--all')) {
    console.error(usage)
    process.exitCode = 1
  } else {
    await runAi(cases)
  }
}

await main()
