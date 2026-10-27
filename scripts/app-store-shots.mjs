// Capturas de la App Store (1320 × 2868 px, iPhone de 6,9"), en el orden en que se suben. Seis, que
// cuentan cómo funciona la app de principio a fin: escribir como se habla, el día en el horario (con
// soltar a la hora que se quiera), los avisos por lugar, las rutinas, lo que se hace sin abrirla (widgets,
// el micrófono, Siri y el aviso al acabar) y que todo se queda en el iPhone (en modo oscuro). Cada una es
// la app real (build de producción, datos de ejemplo) dentro de un iPhone, con titular, el número en
// romanos y un detalle que sale del marco (store-frames.mjs).
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
import { FONTS, READY, creed, device, frame, notification, resultCard, slotCard } from './store-frames.mjs'
import { WIDGET_LABELS, dictateWidget, lockScreenRoutines, mediumWidget, routinesWidget } from './store-widgets.mjs'

const LANG = process.argv.includes('--en') ? 'en' : 'es'
const T = STORE_COPY[LANG]

/** Micrófono, campana y candado, en la línea de los iconos de la app. */
const MIC = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#8a5a2c" stroke-width="2" stroke-linecap="round"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21"/></svg>`
const BELL = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z"/><path d="M10 20.5a2 2 0 0 0 4 0"/></svg>`
const LOCK = `<div style="display:grid;place-items:center;width:52px;height:52px;border-radius:50%;background:rgba(244,239,230,.08);box-shadow:inset 0 0 0 1px rgba(214,176,127,.35)"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#d6b07f" stroke-width="1.8" stroke-linecap="round"><rect x="5" y="10.5" width="14" height="10" rx="2.5"/><path d="M8.5 10.5V7.5a3.5 3.5 0 0 1 7 0v3"/></svg></div>`

const PORT = 4174
const BASE = `http://localhost:${PORT}/tasks/`
const OUT = process.argv.slice(2).find((arg) => !arg.startsWith('--')) ?? (LANG === 'en' ? 'docs/capturas/en' : 'docs/capturas')
const DIST = 'dist-shots'

await build({ mode: 'shots', logLevel: 'warn', build: { outDir: DIST, emptyOutDir: true, sourcemap: false } })
mkdirSync(OUT, { recursive: true })

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

/** Sube la lista hasta dejar la cabecera de un bloque a `offset` px del borde de arriba. */
const scrollToBlock = (name, offset) =>
  evaluate(`(() => {
    const head = [...document.querySelectorAll('.section__name')].find((node) => node.textContent === ${JSON.stringify(name)})
    const scroller = head.closest('.app__scroll')
    scroller.scrollTop += head.getBoundingClientRect().top - ${offset}
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

  // El horario: los eventos del calendario entre las tareas, el café en paralelo con la comida y "ahora".
  await scrollToBlock(T.schedule, 84)
  await waitFor(`document.querySelector('.tl--cluster')`)
  await sleep(900)
  screens.schedule = await capture()

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
        numeral: 'I',
        ...c.write,
        content:
          device(screens.write, 300, { tilt: -2.5 }) +
          resultCard(T.resultTitle, [parsedLabel, `${BELL}${T.atTime}`], 'right:14px;top:626px;width:262px;transform:rotate(-2deg)') +
          `<div class="float" style="left:20px;top:770px;transform:rotate(2deg);display:flex;align-items:center;gap:8px;padding:10px 16px 10px 12px;border-radius:999px;background:#f4efe6;color:#1b2540;font:600 15px Inter;box-shadow:0 18px 40px rgba(20,27,46,.25),0 0 0 1px rgba(78,58,34,.12)">${MIC}${T.sayIt}</div>`,
      }),
    ],
    [
      '02-horario',
      frame({
        theme: 'sand',
        numeral: 'II',
        ...c.day,
        content:
          device(screens.schedule, 300, { tilt: 2 }) +
          slotCard({
            ...T.slot,
            hours: [13, 21],
            busy: [
              [14, 15.5],
              [17, 17.75],
              [19, 20],
            ],
            start: 16.75,
            duration: 30,
            style: 'left:16px;top:640px;width:300px;transform:rotate(-2deg)',
          }),
      }),
    ],
    [
      '03-lugares',
      frame({
        numeral: 'III',
        ...c.places,
        content:
          device(screens.places, 300, { tilt: -2 }) +
          // Tres avisos, como se apilan en el iPhone: al salir de casa, al llegar al súper (con la cesta) y al alejarse.
          notification({ icon, title: T.leave, body: T.leaveBody, when: T.earlier, style: 'left:22px;right:22px;top:646px' }) +
          notification({ icon, title: T.place, body: T.placeBody, when: T.later, style: 'left:30px;right:30px;top:740px' }) +
          notification({ icon, title: T.away, body: T.awayBody, when: T.now, style: 'left:38px;right:38px;top:834px' }),
      }),
    ],
    [
      '04-rutinas',
      frame({
        theme: 'night',
        numeral: 'IV',
        ...c.routines,
        content:
          device(screens.routines, 300, { tilt: 2 }) +
          `<div class="float" style="left:34px;top:676px;transform:rotate(-1.5deg)">${lockScreenRoutines({ date: today, title: T.gym, detail: T.gymDetail, emoji: '🏋️', pending: '📖' })}</div>`,
      }),
    ],
    ['05-sin-abrir', widgetsFrame(c.widgets, labels, icon)],
    [
      '06-tuyas',
      frame({
        theme: 'night',
        numeral: 'VI',
        ...c.private,
        content:
          device(screens.dark, 410, { tilt: -2, dark: true }) +
          `<div class="float" style="left:50%;top:222px;margin-left:-26px">${LOCK}</div>` +
          creed(T.privateLines, '#d6b07f', 'left:0;right:0;top:292px;align-items:center'),
      }),
    ],
  ]

  const rendered = []
  for (const [name, html] of shots) {
    const png = await renderHtml(session, html, { width: 440, height: 956, scale: 3, ready: READY })
    // Apple pide las capturas sin transparencia.
    rendered.push([name, encodePng(decodePng(png), true)])
    console.log('✓', name)
  }
  // Las de antes se van solo cuando están todas las nuevas (los nombres cambian con el orden): un fallo a
  // medias no deja la carpeta vacía. Solo las numeradas: lo demás que haya ahí no es de este guion.
  for (const name of readdirSync(OUT)) if (/^\d\d-.*\.png$/.test(name)) rmSync(join(OUT, name))
  for (const [name, png] of rendered) writeFileSync(join(OUT, `${name}.png`), png)
} finally {
  session.close()
  await server.close()
}

/**
 * Sin iPhone: los widgets sobre la arena como en la pantalla de inicio (hoy, dictar, rutinas y la
 * bandeja), Siri apuntando y, abajo, el aviso que pregunta si se ha acabado con sus dos botones.
 */
function widgetsFrame(copy, labels, icon) {
  const w = T.widgets
  return frame({
    theme: 'sand',
    numeral: 'V',
    ...copy,
    content: `
      <div class="float" style="left:34px;top:262px">${mediumWidget(w.today, 5, labels)}</div>
      <div class="float" style="left:34px;top:458px">${dictateWidget(w.dictate)}</div>
      <div class="float" style="left:230px;top:458px">${routinesWidget(w.routines, labels.routines)}</div>
      <div class="float" style="left:34px;right:34px;top:656px;padding:14px 18px;border-radius:22px;background:rgba(27,37,64,.06);box-shadow:inset 0 0 0 1px rgba(78,58,34,.14)">
        <div style="font:600 11px Inter;letter-spacing:.16em;text-transform:uppercase;color:#8a5a2c">Siri</div>
        <div style="margin-top:6px;font:italic 500 18px/1.3 'Source Serif 4',serif;color:#1b2540">${w.siri}</div>
        <div style="margin-top:6px;font:400 13px Inter;color:#5a544a">${w.siriReply}</div>
      </div>
      ${notification({ icon, title: T.lunch, body: T.askBody, when: T.now, actions: T.askActions, style: 'left:34px;right:34px;top:780px' })}`,
  })
}
