// Comprueba `dist-native/headless.js` como lo ejecuta el iPhone: JavaScriptCore sin navegador ni
// Node (sin window, fetch, console ni setTimeout). Si alguien importa en el núcleo algo que los
// necesite, falla aquí y no en el iPhone de alguien con Siri esperando.
// Uso: node scripts/check-headless.mjs [ruta]   (lo lanza `npm run build:native`)
import { readFileSync } from 'node:fs'
import vm from 'node:vm'

const path = process.argv[2] ?? 'dist-native/headless.js'
const context = vm.createContext({})
vm.runInContext(readFileSync(path, 'utf8'), context, { filename: path })

const core = context.TasksHeadless
const fail = (message) => {
  console.error(`headless.js: ${message}`)
  process.exit(1)
}

if (!core || typeof core.add !== 'function' || typeof core.context !== 'function') fail('no expone TasksHeadless.add/context')
if (core.version !== 1) fail(`versión inesperada del contrato: ${core.version}`)
if (typeof core.api !== 'string') fail('falta la URL del servidor (aunque sea vacía)')

const now = Date.now()
const state = { schemaVersion: 5, tasks: [], sections: [], places: [], collapsed: {}, settings: {} }
const result = JSON.parse(
  core.add(JSON.stringify({ now, text: 'llamar a Miguel mañana a las 17:00', interpreted: null, state, inbox: [], widgetChanges: [] })),
)

if (result.entry?.tasks?.[0]?.title !== 'Llamar a Miguel') fail(`no entiende una frase básica: ${JSON.stringify(result)}`)
if (!Array.isArray(result.plan?.timed) || result.plan.timed.length !== 1) fail('no programa el aviso de la tarea')
if (!result.message.startsWith('Apuntada:')) fail(`mensaje inesperado: ${result.message}`)
if (!/^\{"today":"\d{4}-\d{2}-\d{2}","now":"\d{2}:\d{2}"\}$/.test(core.context(now))) fail('contexto de voz mal formado')

console.log(`headless.js listo (${readFileSync(path).length} bytes${core.api ? '' : ', sin servidor de dictado'})`)
