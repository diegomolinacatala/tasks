// Capturas de la App Store (1320 × 2868 px, iPhone de 6,9"), en el orden en que se suben. Las tres
// primeras son las que salen en la búsqueda: dicen lo que hace la app distinta (escribir como se
// habla, avisos por lugar y el calendario junto a las tareas, desde la 1.6); la cuarta, los plazos. Cada una es la app real (build de producción, datos
// de ejemplo) dentro de un iPhone, con titular y un detalle que sale del marco (store-frames.mjs).
//
//   node scripts/app-store-shots.mjs          # → docs/capturas/01-escribir.png … (en español)
//   node scripts/app-store-shots.mjs --en     # → docs/capturas/en/… (la ficha en inglés)
//
// Compila la web con `--mode shots` en dist-shots/: igual que la de producción, pero con la pestaña
// Lugares de la app (sin Apple Maps sale el plano dibujado). Usa Edge sin ventana (edge.mjs). La
// letra es Inter y Source Serif 4 en vez de San Francisco y New York, que no se pueden usar fuera de
// Apple: son lo más parecido.
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { build, preview } from 'vite'
import { decodePng, encodePng, launch, renderHtml, sleep } from './edge.mjs'
import { sampleState, writeStateExpression } from './sample-state.mjs'
import { STORE_COPY } from './store-copy.mjs'
import { FONTS, READY, device, frame, notification } from './store-frames.mjs'
import { WIDGET_LABELS, lockScreenRoutines, mediumWidget, routinesWidget, smallWidget } from './store-widgets.mjs'

const LANG = process.argv.includes('--en') ? 'en' : 'es'
const T = STORE_COPY[LANG]

/** Micrófono y candado, en la línea de los iconos de la app. */
const MIC = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#8a5a2c" stroke-width="2" stroke-linecap="round"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21"/></svg>`
const BELL = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z"/><path d="M10 20.5a2 2 0 0 0 4 0"/></svg>`
const LOCK = `<div style="display:grid;place-items:center;width:44px;height:44px;border-radius:50%;background:rgba(244,239,230,.08);box-shadow:inset 0 0 0 1px rgba(214,176,127,.35)"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#d6b07f" stroke-width="1.8" stroke-linecap="round"><rect x="5" y="10.5" width="14" height="10" rx="2.5"/><path d="M8.5 10.5V7.5a3.5 3.5 0 0 1 7 0v3"/></svg></div>`

const PORT = 4174
const BASE = `http://localhost:${PORT}/tasks/`
const OUT = process.argv.slice(2).find((arg) => !arg.startsWith('--')) ?? (LANG === 'en' ? 'docs/capturas/en' : 'docs/capturas')
const DIST = 'dist-shots'

await build({ mode: 'shots', logLevel: 'warn', build: { outDir: DIST, emptyOutDir: true, sourcemap: false } })
mkdirSync(OUT, { recursive: true })
// Las de antes se van: los nombres cambian con el orden.
for (const name of readdirSync(OUT)) if (name.endsWith('.png')) rmSync(join(OUT, name))

/** Hora de las capturas: la marca de "ahora" del horario cae a media mañana, se ejecute cuando se ejecute. */
const SHOT_TIME = [11, 20]

// En cada página: el reloj a `SHOT_TIME` de hoy, la letra de las capturas, márgenes de un iPhone con
// Dynamic Island y fuera los avisos que solo salen en la web (en la app nativa no existen).
const PAGE_SETUP = `
;(() => {
  const RealDate = Date
  const target = new RealDate()
  target.setHours(${SHOT_TIME[0]}, ${SHOT_TIME[1]}, 0, 0)
  const offset = target.getTime() - RealDate.now()
  class ShotDate extends RealDate {
    constructor(...args) {
      if (args.length) super(...args)
      else super(RealDate.now() + offset)
    }
    static now() {
      return RealDate.now() + offset
    }
  }
  window.Date = ShotDate
})()
document.addEventListener('DOMContentLoaded', () => {
  const link = document.createElement('link')
  link.rel = 'stylesheet'
  link.href = '${FONTS}'
  document.head.appendChild(link)
  const style = document.createElement('style')
  style.textContent = ':root{--safe-t:62px!important;--safe-b:34px!important;--font:Inter,sans-serif!important;--font-serif:"Source Serif 4",serif!important}'
  document.head.appendChild(style)
  const webOnly = /avisos|pantalla de inicio|reminders|home screen/i
  const hide = () => document.querySelectorAll('.sheet__hint, .sheet__note, .group__note').forEach((el) => {
    if (webOnly.test(el.textContent || '')) el.style.display = 'none'
  })
  new MutationObserver(hide).observe(document.body, { childList: true, subtree: true })
})`

const server = await preview({ preview: { port: PORT, strictPort: true }, build: { outDir: DIST }, logLevel: 'silent' })
const session = await launch()
const { send, evaluate } = session

const waitFor = async (expression, timeout = 15_000) => {
  const start = Date.now()
  while (Date.now() - start < timeout) {
    if (await evaluate(`Boolean(${expression})`)) return
    await sleep(100)
  }
  throw new Error(`No aparece: ${expression}`)
}

/** El estado se escribe desde una página del mismo origen sin la app: si no, al salir guardaría encima. */
async function seed(state) {
  await send('Page.navigate', { url: `${BASE}privacidad.html` })
  await waitFor(`document.readyState === 'complete'`)
  await evaluate(writeStateExpression(state))
}

/** Abre la app y espera a que el arranque (#boot) haya terminado de fundirse. */
async function open() {
  await send('Page.navigate', { url: BASE })
  await waitFor(`document.readyState === 'complete' && document.querySelector('.row') && !document.getElementById('boot')`)
  await evaluate('document.fonts.ready.then(() => true)')
  await sleep(600)
}

const click = (selector, text) =>
  evaluate(`(() => {
    const el = [...document.querySelectorAll(${JSON.stringify(selector)})].find((node) => (node.textContent || node.getAttribute('aria-label') || '').includes(${JSON.stringify(text)}))
    if (!el) throw new Error('No encuentro ' + ${JSON.stringify(`${selector} «${text}»`)})
    el.click()
    return true
  })()`)

const dataUrl = (png) => `data:image/png;base64,${png.toString('base64')}`

async function capture() {
  const { data } = await send('Page.captureScreenshot', { format: 'png' })
  return dataUrl(Buffer.from(data, 'base64'))
}

try {
  await send('Emulation.setDeviceMetricsOverride', { width: 440, height: 956, deviceScaleFactor: 3, mobile: true })
  await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 })
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'light' }] })
  // Nada de una ejecución anterior: ni datos ni el service worker con la web de entonces.
  await send('Storage.clearDataForOrigin', { origin: `http://localhost:${PORT}`, storageTypes: 'all' })
  const { identifier } = await send('Page.addScriptToEvaluateOnNewDocument', { source: PAGE_SETUP })

  const screens = {}
  await seed(sampleState({ language: LANG }))
  await open()
  screens.agenda = await capture()

  // El calendario: el horario arriba, con los eventos (de colores) entre las tareas.
  await evaluate(`(() => {
    const head = [...document.querySelectorAll('.section__name')].find((node) => node.textContent === ${JSON.stringify(T.schedule)})
    const scroller = head.closest('.app__scroll')
    scroller.scrollTop += head.getBoundingClientRect().top - 84
    return true
  })()`)
  await waitFor(`document.querySelector('.tl--event')`)
  await sleep(900)
  screens.calendar = await capture()

  // Plazos: lo que se ve en "Sin hora", con "Hasta el …" y "Último día" en sus filas.
  await evaluate(`(() => {
    const head = [...document.querySelectorAll('.section__name')].find((node) => node.textContent === ${JSON.stringify(T.untimed)})
    const scroller = head.closest('.app__scroll')
    scroller.scrollTop += head.getBoundingClientRect().top - 150
    return true
  })()`)
  await waitFor(`document.querySelector('.row__period.is-last')`)
  await sleep(900)
  screens.period = await capture()

  await open()
  await click('.tabs__tab', T.tabs.inbox)
  await waitFor(`document.querySelector('.routine')`)
  await sleep(800)
  screens.routines = await capture()

  await click('.tabs__tab', T.tabs.places)
  await waitFor(`document.querySelector('.place-card')`)
  await sleep(900)
  screens.places = await capture()

  // Escribir: la frase con Carlota, con la píldora de lo que ha entendido.
  await open()
  await evaluate(`document.querySelector('.composer__input').focus()`)
  await send('Input.insertText', { text: T.phrase })
  await waitFor(`document.querySelector('.composer__parsed')`)
  const parsedLabel = await evaluate(`document.querySelector('.composer__parsed').textContent.trim()`)
  // La píldora estrecha la barra al aparecer: que se lea el principio de la frase, no un trozo.
  await evaluate(`(() => { const input = document.querySelector('.composer__input'); input.setSelectionRange(0, 0); input.scrollLeft = 0; return true })()`)
  await sleep(400)
  screens.write = await capture()

  // Y la ficha desplegada (Detalles), con todo lo que se puede decidir antes de añadir; con tramo,
  // para que la regla de la duración salga marcada.
  await open()
  await evaluate(`document.querySelector('.composer__input').focus()`)
  await send('Input.insertText', { text: T.detailsPhrase })
  await waitFor(`document.querySelector('.composer__parsed')`)
  await click('.composer__more', '')
  await waitFor(`document.querySelector('.sheet.is-open .compose-sheet__title')`)
  await evaluate(`(() => { document.activeElement?.blur(); return true })()`)
  await sleep(900)
  screens.details = await capture()

  await open()
  await click('button', T.sizing)
  await waitFor(`document.querySelector('.knob')`)
  // Lo que tiene tamaño está en "Sin hora": la lista sube hasta ahí.
  await evaluate(`(() => {
    const head = [...document.querySelectorAll('.section__name')].find((node) => node.textContent === ${JSON.stringify(T.untimed)})
    const scroller = head.closest('.app__scroll')
    scroller.scrollTop += head.getBoundingClientRect().top - 150
    return true
  })()`)
  await sleep(900)
  screens.importance = await capture()

  await seed(sampleState({ theme: 'dark', language: LANG }))
  await open()
  screens.dark = await capture()

  await send('Page.removeScriptToEvaluateOnNewDocument', { identifier })

  const icon = dataUrl(readFileSync('public/icons/icon-192.png'))
  const labels = WIDGET_LABELS[LANG]
  const today = new Intl.DateTimeFormat(LANG === 'en' ? 'en-US' : 'es-ES', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date())
  const c = T.shots
  const shots = [
    [
      '01-escribir',
      frame({
        ...c.write,
        content:
          device(screens.write, 262) +
          resultCard(T.resultTitle, [parsedLabel, `${BELL}${T.atTime}`]) +
          `<div class="float" style="left:18px;top:742px;transform:rotate(2deg);display:flex;align-items:center;gap:8px;padding:10px 16px 10px 12px;border-radius:999px;background:#f4efe6;color:#1b2540;font:600 15px Inter;box-shadow:0 18px 40px rgba(20,27,46,.25),0 0 0 1px rgba(78,58,34,.12)">${MIC}${T.sayIt}</div>`,
      }),
    ],
    [
      '02-lugares',
      frame({
        theme: 'sand',
        ...c.places,
        content:
          device(screens.places, 262) +
          notification({ icon, title: T.place, body: T.placeBody, when: T.now, style: 'left:22px;right:22px;top:640px' }),
      }),
    ],
    ['03-calendario', frame({ ...c.calendar, content: device(screens.calendar, 262) + calendarCard(T.calendarCard) })],
    [
      '04-plazos',
      frame({
        theme: 'sand',
        ...c.period,
        content: device(screens.period, 262) + resultCard(T.periodTitle, T.periodChips),
      }),
    ],
    [
      '05-rutinas',
      frame({
        theme: 'night',
        ...c.routines,
        content:
          device(screens.routines, 262) +
          `<div class="float" style="left:34px;top:652px">${lockScreenRoutines({ date: today, title: T.gym, detail: T.gymDetail, emoji: '🏋️', pending: '📖' })}</div>`,
      }),
    ],
    ['06-widgets', widgetsFrame(c.widgets, labels)],
    [
      '07-has-acabado',
      frame({
        theme: 'sand',
        ...c.ask,
        content:
          device(screens.agenda, 262, { blurred: true }) +
          notification({ icon, title: T.lunch, body: T.askBody, when: T.now, actions: T.askActions, style: 'left:34px;right:34px;top:470px' }),
      }),
    ],
    ['08-detalles', frame({ theme: 'night', ...c.details, content: device(screens.details, 262) })],
    ['09-importancia', frame({ ...c.importance, content: device(screens.importance, 262) })],
    [
      '10-privada',
      frame({
        theme: 'night',
        ...c.private,
        content: device(screens.dark, 262, { dark: true }) + `<div class="float" style="left:50%;top:214px;margin-left:-22px">${LOCK}</div>`,
      }),
    ],
  ]

  for (const [name, html] of shots) {
    const png = await renderHtml(session, html, { width: 440, height: 956, scale: 3, ready: READY })
    // Apple pide las capturas sin transparencia.
    writeFileSync(join(OUT, `${name}.png`), encodePng(decodePng(png), true))
    console.log('✓', name)
  }
} finally {
  session.close()
  await server.close()
}

/**
 * Los calendarios que se ven en la Agenda (de cada cuenta) y adónde van las tareas con hora, como la lista
 * de Ajustes → Calendario, flotando sobre la app.
 */
function calendarCard(card) {
  const check = `<svg width="14" height="14" viewBox="0 0 24 24"><path d="M4.5 12.5 9.5 17.5 19.5 6.5" fill="none" stroke="#8a5a2c" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`
  const row = (name, account, color, last) =>
    `<div style="display:flex;align-items:center;gap:10px;padding:8px 0;${last ? '' : 'border-bottom:1px solid rgba(78,58,34,.1)'}">
      <span style="flex:none;width:11px;height:11px;border-radius:50%;background:color-mix(in oklab, ${color} 60%, #736a5c)"></span>
      <span style="flex:1;font:500 15px Inter;color:#1b2540">${name}</span>
      <span style="font:400 13px Inter;color:#7d7466">${account}</span>
      ${check}
    </div>`
  const rows = card.rows.map(({ name, account, color }, index) => row(name, account, color, index === card.rows.length - 1)).join('')
  return `<div class="float" style="right:12px;top:716px;width:252px;transform:rotate(2deg);padding:12px 16px 10px;border-radius:22px;background:#fbf8f2;box-shadow:0 26px 56px rgba(20,27,46,.3),0 0 0 1px rgba(78,58,34,.1)">
    <div style="font:600 11px Inter;letter-spacing:.14em;text-transform:uppercase;color:#8a5a2c">${card.title}</div>
    ${rows}
    <div style="display:flex;align-items:center;gap:8px;margin-top:6px;padding:9px 12px;border-radius:14px;background:rgba(138,90,44,.1);font:500 13px Inter;color:#8a5a2c;white-space:nowrap">
      <span style="flex:1">${card.tasks}</span><span>→ ${card.tasksTo}</span>
    </div>
  </div>`
}

/** La tarea que sale de la frase, como tarjeta que flota sobre la app: lo que se gana, a la vista. */
function resultCard(title, chips) {
  const pills = chips
    .map(
      (chip) =>
        `<span style="display:inline-flex;align-items:center;gap:5px;padding:5px 11px;border-radius:999px;background:rgba(138,90,44,.12);color:#8a5a2c;font:600 13.5px Inter;white-space:nowrap">${chip}</span>`,
    )
    .join('')
  return `<div class="float" style="right:16px;top:600px;width:268px;transform:rotate(-2deg);padding:16px 18px;border-radius:22px;background:#fbf8f2;box-shadow:0 26px 56px rgba(20,27,46,.3),0 0 0 1px rgba(78,58,34,.1)">
    <div style="display:flex;gap:12px;align-items:flex-start">
      <span style="flex:none;margin-top:3px;width:21px;height:21px;border-radius:50%;border:1.5px solid rgba(78,58,34,.3)"></span>
      <div style="min-width:0">
        <div style="font:600 20px/1.2 'Source Serif 4',serif;color:#1b2540">${title}</div>
        <div style="margin-top:9px;display:flex;flex-wrap:wrap;gap:6px">${pills}</div>
      </div>
    </div>
  </div>`
}

function widgetsFrame(copy, labels) {
  const w = T.widgets
  return frame({
    theme: 'night',
    ...copy,
    content: `
      <div class="float" style="left:34px;top:270px">${mediumWidget(w.today, 4, labels)}</div>
      <div class="float" style="left:34px;top:472px">${smallWidget(w.inbox, 5, labels.inbox)}</div>
      <div class="float" style="left:230px;top:472px">${routinesWidget(w.routines, labels.routines)}</div>
      <div class="float" style="left:34px;right:34px;top:686px;padding:16px 18px;border-radius:22px;background:rgba(244,239,230,.08);box-shadow:inset 0 0 0 1px rgba(244,239,230,.12)">
        <div style="font:500 12px Inter;letter-spacing:.14em;text-transform:uppercase;color:#d6b07f">Siri</div>
        <div style="margin-top:8px;font:italic 500 19px/1.3 'Source Serif 4',serif;color:#f4efe6">${w.siri}</div>
        <div style="margin-top:8px;font:400 13.5px Inter;color:#b3aa9a">${w.siriReply}</div>
      </div>`,
  })
}
