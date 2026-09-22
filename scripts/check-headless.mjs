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

if (
  !core ||
  typeof core.add !== 'function' ||
  typeof core.move !== 'function' ||
  typeof core.context !== 'function' ||
  typeof core.consent !== 'function'
) {
  fail('no expone TasksHeadless.add/move/context/consent')
}
if (core.version !== 3) fail(`versión inesperada del contrato: ${core.version}`)
if (typeof core.api !== 'string') fail('falta la URL del servidor (aunque sea vacía)')

const now = Date.now()
const state = { schemaVersion: 6, tasks: [], sections: [], places: [], collapsed: {}, settings: {} }
const result = JSON.parse(
  core.add(JSON.stringify({ now, text: 'llamar a Miguel mañana a las 17:00', interpreted: null, state, inbox: [], widgetChanges: [] })),
)

if (result.entry?.tasks?.[0]?.title !== 'Llamar a Miguel') fail(`no entiende una frase básica: ${JSON.stringify(result)}`)
if (!Array.isArray(result.plan?.timed) || result.plan.timed.length !== 1) fail('no programa el aviso de la tarea')
if (!result.message.startsWith('Apuntada:')) fail(`mensaje inesperado: ${result.message}`)
if (!/^\{"today":"\d{4}-\d{2}-\d{2}","now":"\d{2}:\d{2}"\}$/.test(core.context(now))) fail('contexto de voz mal formado')
if (core.consent(JSON.stringify(state)) !== 'false') fail('sin permiso, la frase no puede ir al servidor')
if (core.consent(JSON.stringify({ ...state, settings: { dictation: true } })) !== 'true') fail('no lee el permiso del dictado')

const overdue = { id: 'ayer', title: 'Pagar la luz', done: false, date: '2000-01-01', time: null, reminders: [], sectionId: null, order: 0 }
const moved = JSON.parse(core.move(JSON.stringify({ now, state: { ...state, tasks: [overdue] }, inbox: [], widgetChanges: [] })))
if (moved.entry?.move?.taskIds?.[0] !== 'ayer') fail(`no pasa lo atrasado a hoy: ${JSON.stringify(moved)}`)
if (moved.widget?.tasks?.[0]?.date !== moved.entry.move.date) fail('la foto del widget no refleja lo pasado a hoy')

console.log(`headless.js listo (${readFileSync(path).length} bytes${core.api ? '' : ', sin servidor de dictado'})`)
