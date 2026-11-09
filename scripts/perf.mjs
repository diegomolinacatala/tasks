// Fluidez en un móvil modesto: la versión de producción con la CPU frenada (6× por defecto, como un
// iPhone de hace unos años) y mucho que pintar (230 tareas). Recorre la app con el dedo simulado y da,
// por acción, la mediana de varias pasadas: tareas largas (> 50 ms), la respuesta más lenta a un toque
// y el peor fotograma. Sirve para comparar antes y después de un cambio, no como cifra absoluta.
//
// Uso: npm run build, `npm run preview -- --port 4173` en otra terminal y
//      node scripts/perf.mjs [ritmo=6] [pasadas=3]      (PORT=4174 para otro servidor)
import { launch, sleep } from './edge.mjs'
import { isoFromToday, sampleState, writeStateExpression } from './sample-state.mjs'

const RATE = Number(process.argv[2] ?? 6)
const RUNS = Number(process.argv[3] ?? 3)
const PORT = process.env.PORT ?? '4173'
const ORIGIN = `http://localhost:${PORT}`
const BASE = `${ORIGIN}/tasks/`

const blank = (id, title, date, extra = {}) => ({
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

/** Los datos de las capturas más 160 tareas en dos meses, 30 en la Bandeja, 18 hoy y 6 rutinas. */
function heavyState() {
  const state = sampleState()
  const titles = ['Llamar al banco', 'Revisar el correo', 'Comprar fruta', 'Preparar la reunión', 'Pagar el gimnasio', 'Leer el informe']
  for (let index = 0; index < 160; index++) {
    const offset = (index % 60) - 30
    state.tasks.push(
      blank(`extra-${index}`, `${titles[index % titles.length]} ${index}`, isoFromToday(offset), {
        done: offset < 0 || index % 5 === 0,
        time: index % 3 === 0 ? `${String(8 + (index % 12)).padStart(2, '0')}:${index % 2 ? '30' : '00'}` : null,
        duration: index % 6 === 0 ? 45 : null,
        reminders: index % 3 === 0 ? [{ id: `rx${index}`, kind: 'before', minutes: 0 }] : [],
        sectionId: index % 4 === 0 ? 'trabajo' : null,
        order: index,
        importance: 1 + (index % 4),
      }),
    )
  }
  for (let index = 0; index < 30; index++) state.tasks.push(blank(`bandeja-${index}`, `Idea ${index}`, null, { order: 10 + index }))
  for (let index = 0; index < 18; index++) {
    state.tasks.push(blank(`hoy-${index}`, `Recado ${index}`, isoFromToday(0), { sectionId: index % 3 === 0 ? 'trabajo' : null, order: 20 + index }))
  }
  const emojis = ['☕', '💧', '📚', '🏃', '🌿', '🧹']
  for (let index = 0; index < emojis.length; index++) {
    state.routines.push({
      id: `r-${index}`,
      title: `Rutina ${index}`,
      emoji: emojis[index],
      days: [1, 2, 3, 4, 5, 6, 7],
      time: index % 2 ? '08:00' : null,
      done: [isoFromToday(-1), isoFromToday(-2)],
      order: 10 + index,
      createdAt: Date.now() - 20 * 86_400_000,
    })
  }
  return state
}

/** Tareas largas, tiempo de respuesta a cada toque (Event Timing) y el intervalo entre fotogramas. */
const INSTRUMENT = `
window.__perf = { long: [], events: [], frames: [] }
try {
  new PerformanceObserver((list) => list.getEntries().forEach((e) => window.__perf.long.push(Math.round(e.duration)))).observe({ type: 'longtask', buffered: true })
  new PerformanceObserver((list) => list.getEntries().forEach((e) => window.__perf.events.push(Math.round(e.duration)))).observe({ type: 'event', durationThreshold: 16, buffered: true })
} catch (error) {}
let last = performance.now()
const loop = (now) => { window.__perf.frames.push(now - last); last = now; requestAnimationFrame(loop) }
requestAnimationFrame(loop)
`

const session = await launch({ port: 9350 })
const { send, evaluate } = session
const results = []

const reset = () => evaluate(`window.__perf.long = []; window.__perf.events = []; window.__perf.frames = []; true`)
const collect = async (label) => {
  const perf = await evaluate(`window.__perf`)
  const frames = perf.frames.slice(1)
  results.push({
    label,
    largas: perf.long.reduce((sum, ms) => sum + ms, 0),
    respuesta: Math.max(0, ...perf.events),
    'peor fotograma': Math.round(Math.max(0, ...frames)),
  })
}

const center = (selector, index = 0) =>
  evaluate(`(() => {
    const all = [...document.querySelectorAll(${JSON.stringify(selector)})].filter((n) => n.getClientRects().length > 0)
    const r = all[${index}]?.getBoundingClientRect()
    return r ? { x: r.x + r.width / 2, y: r.y + r.height / 2 } : null
  })()`)

const tap = async (selector, index = 0) => {
  const point = await center(selector, index)
  if (!point) return console.log(`(no encuentro ${selector})`)
  await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point] })
  await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
}

const drag = async (from, dx, dy, steps = 12) => {
  if (!from) return
  await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [from] })
  for (let step = 1; step <= steps; step++) {
    await send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: from.x + (dx * step) / steps, y: from.y + (dy * step) / steps }] })
    await sleep(16)
  }
  await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
}

const step = async (label, action, wait = 1000) => {
  await reset()
  await action()
  await sleep(wait)
  await collect(label)
}

try {
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 3, mobile: true })
  await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 })
  await send('Page.navigate', { url: `${BASE}privacidad.html` })
  await sleep(800)
  await send('Storage.clearDataForOrigin', { origin: ORIGIN, storageTypes: 'all' })
  await evaluate(writeStateExpression(heavyState()))
  await send('Page.addScriptToEvaluateOnNewDocument', { source: INSTRUMENT })
  await send('Emulation.setCPUThrottlingRate', { rate: RATE })

  for (let run = 0; run < RUNS; run++) {
    await send('Page.navigate', { url: BASE })
    // Hasta que se retira la pantalla de arranque y algo más, para que acabe la entrada.
    for (let i = 0; i < 400; i++) {
      await sleep(25)
      if (await evaluate(`!document.getElementById('boot') && !!document.querySelector('.app')`).catch(() => false)) break
    }
    await sleep(1500)
    await step('tachar', () => tap('.task .row__check', 2))
    await step('deslizar', async () => drag(await center('.task .swipe__surface', 3), 120, 0))
    await step('desplegar mes', () => tap('.agenda__month'), 1200)
    await step('recoger mes', () => tap('.agenda__month'), 1200)
    await step('semana siguiente', async () => {
      const point = await center('.strip')
      await drag(point && { x: point.x + 120, y: point.y }, -260, 0, 10)
    }, 1200)
    await step('volver a hoy', () => tap('.agenda__today'), 1200)
    await step('scroll', () => drag({ x: 200, y: 600 }, 0, -420, 14), 1200)
    await step('abrir tarea', () => tap('.tl-row .tl__body', 1))
    await step('cerrar tarea', () => tap('.sheet__scrim'))
    await step('pestaña Bandeja', () => tap('.tabs__tab', 0))
    await step('pestaña Agenda', () => tap('.tabs__tab', 1))
    await step('escribir', async () => {
      await tap('.composer__input')
      await sleep(500)
      for (const char of 'llamar a mamá mañana a las 5') {
        await send('Input.insertText', { text: char })
        await sleep(60)
      }
    })
    await step('añadir', async () => {
      const enter = { key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 }
      await send('Input.dispatchKeyEvent', { type: 'keyDown', ...enter })
      await send('Input.dispatchKeyEvent', { type: 'keyUp', ...enter })
    })
    await step('soltar la barra', () => tap('.app__veil'), 800)
    await step('pestaña Ajustes', () => tap('.tabs__tab', 3), 1200)
    await step('pestaña Lugares', () => tap('.tabs__tab', 2), 1200)
  }

  const median = (values) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)]
  const labels = [...new Set(results.map((row) => row.label))]
  console.log(`CPU ${RATE}× más lenta · mediana de ${RUNS} pasadas (ms)`)
  console.table(
    labels.map((label) => {
      const rows = results.filter((row) => row.label === label)
      return {
        acción: label,
        largas: median(rows.map((row) => row.largas)),
        respuesta: median(rows.map((row) => row.respuesta)),
        'peor fotograma': median(rows.map((row) => row['peor fotograma'])),
      }
    }),
  )
} finally {
  session.close()
}
