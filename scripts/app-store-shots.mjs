// Capturas de la App Store (1320 × 2868 px, iPhone de 6,9"), en el orden en que se suben. Las tres
// primeras son las que salen en la búsqueda. Cada una es la app real (build de producción, datos de
// ejemplo) dentro de un iPhone, con titular y un detalle que sale del marco (store-frames.mjs).
//
//   node scripts/app-store-shots.mjs          # → docs/capturas/1-agenda.png …
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
import { FONTS, READY, device, frame, notification } from './store-frames.mjs'
import { lockScreenRoutines, mediumWidget, routinesWidget, smallWidget } from './store-widgets.mjs'

const PORT = 4174
const BASE = `http://localhost:${PORT}/tasks/`
const OUT = process.argv[2] ?? 'docs/capturas'
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
  const webOnly = /avisos|pantalla de inicio/i
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
  await seed(sampleState())
  await open()
  screens.agenda = await capture()

  // La tira desplegada en el mes entero (tocando el mes de la cabecera).
  await click('.agenda__month', '')
  await waitFor(`document.querySelector('.cal.is-month')`)
  await sleep(900)
  screens.month = await capture()

  await open()
  await click('.tabs__tab', 'Bandeja')
  await waitFor(`document.querySelector('.routine')`)
  await sleep(800)
  screens.routines = await capture()

  await click('.tabs__tab', 'Lugares')
  await waitFor(`document.querySelector('.place-card')`)
  await sleep(900)
  screens.places = await capture()

  await open()
  await evaluate(`document.querySelector('.composer__input').focus()`)
  await send('Input.insertText', { text: 'Cena con Ana el viernes de 9 a 11 de la noche' })
  await waitFor(`document.querySelector('.composer__parsed')`)
  const parsedLabel = await evaluate(`document.querySelector('.composer__parsed').textContent.trim()`)
  // La píldora estrecha la barra al aparecer: que se lea el principio de la frase, no un trozo.
  await evaluate(`(() => { const input = document.querySelector('.composer__input'); input.setSelectionRange(0, 0); input.scrollLeft = 0; input.blur(); return true })()`)
  await sleep(400)
  screens.write = await capture()

  await open()
  await click('button', 'Tamaño según importancia')
  await waitFor(`document.querySelector('.knob')`)
  // Lo que tiene tamaño está en "Sin hora": la lista sube hasta ahí.
  await evaluate(`(() => {
    const head = [...document.querySelectorAll('.section__name')].find((node) => node.textContent === 'Sin hora')
    const scroller = head.closest('.app__scroll')
    scroller.scrollTop += head.getBoundingClientRect().top - 150
    return true
  })()`)
  await sleep(900)
  screens.importance = await capture()

  await seed(sampleState({ theme: 'dark' }))
  await open()
  screens.dark = await capture()

  await send('Page.removeScriptToEvaluateOnNewDocument', { identifier })

  const icon = dataUrl(readFileSync('public/icons/icon-192.png'))
  const shots = [
    [
      '1-agenda',
      frame({
        kicker: 'Tasks',
        title: 'Tu día, *a su hora*.',
        sub: 'Lo que tiene hora, en su sitio; lo demás, en su lista. Sin cuentas: todo se queda en tu iPhone.',
        content: device(screens.agenda, 262),
      }),
    ],
    [
      '2-rutinas',
      frame({
        theme: 'night',
        kicker: 'Rutinas',
        title: 'Lo de cada día, *de un toque*.',
        sub: 'Táchalas desde la pantalla de bloqueo. Cada día vuelven a empezar y la racha se lleva sola.',
        content:
          device(screens.routines, 262) +
          `<div class="float" style="left:34px;top:652px">${lockScreenRoutines({
            date: new Intl.DateTimeFormat('es-ES', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date()),
            title: 'Gimnasio',
            detail: '19:00 · 1 de 4 hoy',
            emoji: '🏋️',
            pending: '📖',
          })}</div>`,
      }),
    ],
    [
      '3-lugares',
      frame({
        theme: 'sand',
        kicker: 'Avisos por lugar',
        title: 'Te avisa *al llegar*.',
        sub: 'Pon «al pasar por Mercadona» y el aviso salta cuando llegas, no antes.',
        content:
          device(screens.places, 262) +
          notification({
            icon,
            title: 'Mercadona',
            body: 'Comprar pan · Leche y huevos',
            style: 'left:22px;right:22px;top:640px',
          }),
      }),
    ],
    [
      '4-mes',
      frame({
        kicker: 'Agenda',
        title: 'De la semana *al mes*.',
        sub: 'Tira de los días hacia abajo y salta a cualquier fecha. Cada anillo dice cómo fue el día.',
        content: device(screens.month, 262),
      }),
    ],
    [
      '5-has-acabado',
      frame({
        theme: 'sand',
        kicker: 'Al acabar',
        title: 'Te pregunta *si has acabado*.',
        sub: 'Táchala desde el propio aviso, sin abrir la app.',
        content:
          device(screens.agenda, 262, { blurred: true }) +
          notification({
            icon,
            title: 'Comida con Ana',
            body: '¿Has acabado? · 14:00–15:30',
            actions: ['Sí, hecha', 'Todavía no'],
            style: 'left:34px;right:34px;top:470px',
          }),
      }),
    ],
    [
      '6-escribir',
      frame({
        theme: 'night',
        kicker: 'Escribe o dicta',
        title: 'Escribe *como hablas*.',
        sub: '«Cena con Ana el viernes de 9 a 11 de la noche». Lo entiende y lo apunta. «Cada día a las 10» es una rutina.',
        content:
          device(screens.write, 262) +
          `<div class="float" style="right:16px;top:676px;transform:rotate(-2deg);white-space:nowrap;padding:12px 20px;border-radius:999px;background:#f4efe6;color:#1b2540;font:600 17px Inter;box-shadow:0 20px 44px rgba(0,0,0,.35)">${parsedLabel}</div>`,
      }),
    ],
    [
      '7-importancia',
      frame({
        theme: 'sand',
        kicker: 'Importancia',
        title: 'Lo importante, *más grande*.',
        sub: 'Desliza el número: el título crece. Sin etiquetas ni colores.',
        content: device(screens.importance, 262),
      }),
    ],
    [
      '8-oscuro',
      frame({
        kicker: 'Modo oscuro',
        title: 'De noche, *en calma*.',
        sub: 'Tonos suaves para la noche, o que siga a tu iPhone.',
        content: device(screens.dark, 262, { dark: true }),
      }),
    ],
    ['9-widget', widgetsFrame()],
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

function widgetsFrame() {
  const tasks = [
    { title: 'Pagar la factura de la luz', overdue: true, detail: 'Ayer', weight: 0.3 },
    { title: 'Comprar pan' },
    { title: 'Preparar la presentación', weight: 0.6 },
    { title: 'Enviar el presupuesto', detail: '12:00' },
  ]
  const small = [{ title: 'Comprar pan' }, { title: 'Presentación', weight: 0.6 }, { title: 'Tender la ropa', done: true }]
  const routines = [
    { title: 'Gimnasio', emoji: '🏋️' },
    { title: 'Leer 20 min', emoji: '📖' },
    { title: 'Estirar', emoji: '🧘' },
    { title: 'Creatina', emoji: '💊', done: true },
  ]
  return frame({
    theme: 'night',
    kicker: 'Widgets y Siri',
    title: 'Siempre *a mano*.',
    sub: 'Tareas y rutinas, desde el widget. «Apunta en Tasks» y Siri la añade sola.',
    content: `
      <div class="float" style="left:34px;top:318px">${mediumWidget(tasks, 4)}</div>
      <div class="float" style="left:34px;top:520px">${smallWidget(small, 4)}</div>
      <div class="float" style="left:230px;top:520px">${routinesWidget(routines)}</div>
      <div class="float" style="left:34px;right:34px;top:734px;padding:16px 18px;border-radius:22px;background:rgba(244,239,230,.08);box-shadow:inset 0 0 0 1px rgba(244,239,230,.12)">
        <div style="font:500 12px Inter;letter-spacing:.14em;text-transform:uppercase;color:#d6b07f">Siri</div>
        <div style="margin-top:8px;font:italic 500 19px/1.3 'Source Serif 4',serif;color:#f4efe6">«Apunta en Tasks cena con Ana mañana a las 9»</div>
        <div style="margin-top:8px;font:400 13.5px Inter;color:#b3aa9a">Apuntada: Cena con Ana, mañana 21:00</div>
      </div>`,
  })
}
