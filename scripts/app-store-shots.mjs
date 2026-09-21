// Capturas para la App Store: la app real (build de producción en `npm run preview`) en un Edge
// sin ventana, a 440 × 956 pt × 3 = 1320 × 2868 px (iPhone de 6,9"), con tareas de ejemplo.
// Sin dependencias: habla con Edge por el protocolo de depuración (WebSocket de Node 22+).
//
//   npm run build && npm run preview -- --port 4173 --strictPort
//   "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe" --headless=new //     --remote-debugging-port=9333 --user-data-dir=%TEMP%/edge-shots --hide-scrollbars about:blank
//   node scripts/app-store-shots.mjs            # → docs/capturas/1-hoy.png …
//
// La letra es Inter en vez de la del sistema: en Windows sería Segoe UI y en el iPhone es San
// Francisco, que no se puede usar fuera de Apple; Inter es lo más parecido.
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const BASE = 'http://localhost:4173/tasks/'
const OUT = process.argv[2] ?? 'docs/capturas'
const PORT = 9333
mkdirSync(OUT, { recursive: true })

const pad = (n) => String(n).padStart(2, '0')
const iso = (offset) => {
  const d = new Date()
  d.setDate(d.getDate() + offset)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}
const today = iso(0)
const task = (id, title, date, extra = {}) => ({
  id,
  title,
  done: false,
  date,
  time: null,
  duration: null,
  reminders: [],
  sectionId: null,
  order: 0,
  importance: 1,
  createdAt: Date.now(),
  completedAt: null,
  ...extra,
})
const atTime = (id) => [{ id, kind: 'before', minutes: 0 }]

const STATE = {
  schemaVersion: 7,
  sections: [{ id: 'trabajo', name: 'Trabajo', order: 0, collapsed: false }],
  places: [
    { id: 'mercadona', name: 'Mercadona', location: { lat: 39.4699, lng: -0.3763, address: 'Valencia' }, radius: 150 },
  ],
  collapsed: { overdue: false, backlog: false },
  settings: { digest: { enabled: true, time: '08:30' } },
  tasks: [
    task('luz', 'Pagar la factura de la luz', iso(-1), { importance: 4 }),
    task('jorge', 'Reunión con Jorge', today, { time: '17:30', duration: 60, reminders: atTime('r1'), order: 0 }),
    task('gym', 'Gimnasio', today, { time: '19:30', duration: 60, reminders: atTime('r2'), order: 1 }),
    task('pan', 'Comprar pan', today, {
      reminders: [{ id: 'r3', kind: 'place', placeId: 'mercadona', on: 'arrive' }],
      order: 2,
    }),
    task('presentacion', 'Preparar la presentación para el cliente', today, { importance: 6, order: 3 }),
    task('ropa', 'Tender la ropa', today, { done: true, completedAt: Date.now(), order: 4 }),
    task('presupuesto', 'Enviar el presupuesto a Javier', today, {
      time: '16:00',
      reminders: [{ id: 'r4', kind: 'before', minutes: 15 }],
      sectionId: 'trabajo',
      order: 0,
    }),
    task('contrato', 'Revisar el contrato', today, { importance: 3, sectionId: 'trabajo', order: 1 }),
    task('regalo', 'Pensar el regalo de Lucía', null, { order: 0 }),
    task('dni', 'Renovar el DNI', null, { order: 1 }),
    task('dentista', 'Dentista', iso(1), { time: '09:30', duration: 45, reminders: [{ id: 'r5', kind: 'before', minutes: 60 }] }),
    task('marta', 'Cena con Marta', iso(2), { time: '21:00', reminders: atTime('r6') }),
    task('itv', 'ITV del coche', iso(3), { time: '10:00', reminders: atTime('r7'), importance: 3 }),
    task('ingles', 'Clase de inglés', iso(4), { time: '18:00', duration: 90, reminders: atTime('r8') }),
    task('padel', 'Partido de pádel', iso(5), { time: '11:00', duration: 90, reminders: atTime('r9') }),
    task('mama', 'Llamar a mamá', iso(6)),
  ],
}

// En cada página: Inter (lo más parecido a San Francisco que hay libre), márgenes de un iPhone con
// Dynamic Island y fuera los avisos que solo salen en la web (en la app nativa no existen).
const PAGE_SETUP = `
document.addEventListener('DOMContentLoaded', () => {
  const link = document.createElement('link')
  link.rel = 'stylesheet'
  link.href = 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=block'
  document.head.appendChild(link)
  const style = document.createElement('style')
  style.textContent = ':root{--safe-t:62px!important;--safe-b:34px!important;--font:Inter,sans-serif!important}'
  document.head.appendChild(style)
  const webOnly = /avisos|pantalla de inicio/i
  const hide = () => document.querySelectorAll('.sheet__hint, .sheet__note').forEach((el) => {
    if (webOnly.test(el.textContent || '')) el.style.display = 'none'
  })
  new MutationObserver(hide).observe(document.body, { childList: true, subtree: true })
})`

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function connect() {
  for (let i = 0; i < 50; i++) {
    try {
      const targets = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()
      const page = targets.find((target) => target.type === 'page')
      if (page) return page.webSocketDebuggerUrl
    } catch {
      /* Edge aún arrancando */
    }
    await sleep(200)
  }
  throw new Error('Edge no responde en el puerto de depuración')
}

const ws = new WebSocket(await connect())
await new Promise((resolve) => ws.addEventListener('open', resolve, { once: true }))
let next = 0
const pending = new Map()
ws.addEventListener('message', (event) => {
  const message = JSON.parse(event.data)
  const done = pending.get(message.id)
  if (!done) return
  pending.delete(message.id)
  if (message.error) done.reject(new Error(JSON.stringify(message.error)))
  else done.resolve(message.result)
})
const send = (method, params = {}) =>
  new Promise((resolve, reject) => {
    const id = ++next
    pending.set(id, { resolve, reject })
    ws.send(JSON.stringify({ id, method, params }))
  })

const evaluate = async (expression) => {
  const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description ?? 'error en la página')
  return result.result.value
}

const waitFor = async (expression, timeout = 10_000) => {
  const start = Date.now()
  while (Date.now() - start < timeout) {
    if (await evaluate(`Boolean(${expression})`)) return
    await sleep(100)
  }
  throw new Error(`No aparece: ${expression}`)
}

async function open(url) {
  await send('Page.navigate', { url })
  await waitFor(`document.readyState === 'complete' && document.querySelector('.row')`)
  await evaluate('document.fonts.ready.then(() => true)')
  await sleep(700)
}

const click = (selector, text) =>
  evaluate(`(() => {
    const el = [...document.querySelectorAll(${JSON.stringify(selector)})].find((node) => (node.textContent || node.getAttribute('aria-label') || '').includes(${JSON.stringify(text)}))
    if (!el) throw new Error('No encuentro ' + ${JSON.stringify(`${selector} «${text}»`)})
    el.click()
    return true
  })()`)

async function shot(name) {
  const { data } = await send('Page.captureScreenshot', { format: 'png' })
  writeFileSync(join(OUT, `${name}.png`), Buffer.from(data, 'base64'))
  console.log('✓', name)
}

await send('Page.enable')
await send('Runtime.enable')
await send('Emulation.setDeviceMetricsOverride', { width: 440, height: 956, deviceScaleFactor: 3, mobile: true })
await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 })
await send('Page.addScriptToEvaluateOnNewDocument', { source: PAGE_SETUP })

// El estado se escribe desde una página del mismo origen sin la app: si la app estuviera abierta,
// al recargar guardaría encima lo que tenía en memoria.
await send('Page.navigate', { url: `${BASE}privacidad.html` })
await waitFor(`document.readyState === 'complete'`)
await evaluate(`new Promise((resolve, reject) => {
  const request = indexedDB.open('keyval-store')
  request.onupgradeneeded = () => request.result.createObjectStore('keyval')
  request.onerror = () => reject(request.error)
  request.onsuccess = () => {
    const tx = request.result.transaction('keyval', 'readwrite')
    tx.objectStore('keyval').put(${JSON.stringify(STATE)}, 'tasks:state:v1')
    tx.oncomplete = () => resolve(true)
    tx.onerror = () => reject(tx.error)
  }
})`)

// 1. El día.
await open(BASE)
await shot('1-hoy')

// 2. Cuánto dura y cuándo pregunta.
await click('.row__main', 'Reunión con Jorge')
await waitFor(`document.querySelector('.sheet.is-open')`)
await sleep(900)
await shot('2-duracion')

// 4. La pregunta al acabar, ya dentro de la app.
await open(`${BASE}?task=jorge&ask=1`)
await waitFor(`document.querySelector('.toast')`)
await sleep(500)
await shot('4-has-acabado')

// 3. Avisos al llegar a un sitio.
await open(BASE)
await click('.row__main', 'Comprar pan')
await waitFor(`document.querySelector('.sheet.is-open')`)
await sleep(900)
await shot('3-lugar')

// 5. Escribir como se habla.
await open(BASE)
await evaluate(`document.querySelector('input[placeholder="Añadir tarea"]').focus()`)
await send('Input.insertText', { text: 'Cena con Ana el viernes de 9 a 11 de la noche' })
await waitFor(`[...document.querySelectorAll('button')].some((b) => (b.getAttribute('aria-label') || '').startsWith('Ignorar'))`)
await sleep(300)
// La píldora estrecha la barra al aparecer: que se lea el principio de la frase, no un trozo.
await evaluate(`(() => { const input = document.querySelector('input[placeholder="Añadir tarea"]'); input.setSelectionRange(0, 0); input.scrollLeft = 0; return true })()`)
await sleep(300)
await shot('5-escribir')

// 6. La semana.
await open(BASE)
await click('button, a, [role=tab], .nav__item', 'Semana')
await waitFor(`document.querySelector('.week, [class*="week"]')`)
await sleep(900)
await shot('6-semana')

// 7. Lo importante, más grande.
await open(BASE)
await click('button', 'Importancia')
await sleep(900)
await shot('7-importancia')

ws.close()
