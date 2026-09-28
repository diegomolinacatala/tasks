// Capturas de la App Store (1320 × 2868 px, iPhone de 6,9"), en el orden en que se suben. Las tres
// primeras son las que salen en la búsqueda. Cada una es la app real (build de producción, tareas de
// ejemplo) dentro de un iPhone, con titular y un detalle que sale del marco (store-frames.mjs).
//
//   npm run build
//   node scripts/app-store-shots.mjs          # → docs/capturas/1-hoy.png …
//
// Usa Edge sin ventana (edge.mjs). La letra es Inter y Source Serif 4 en vez de San Francisco y New
// York, que no se pueden usar fuera de Apple: son lo más parecido.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { preview } from 'vite'
import { decodePng, encodePng, launch, renderHtml, sleep } from './edge.mjs'
import { sampleState, writeStateExpression } from './sample-state.mjs'
import { FONTS, READY, device, frame, notification } from './store-frames.mjs'
import { mediumWidget, smallWidget } from './store-widgets.mjs'

const PORT = 4173
const BASE = `http://localhost:${PORT}/tasks/`
const OUT = process.argv[2] ?? 'docs/capturas'

if (!existsSync('dist/index.html')) throw new Error('Falta la build: ejecuta antes `npm run build`')
mkdirSync(OUT, { recursive: true })

// En cada página: la letra de las capturas, márgenes de un iPhone con Dynamic Island y fuera los
// avisos que solo salen en la web (en la app nativa no existen).
const PAGE_SETUP = `
document.addEventListener('DOMContentLoaded', () => {
  const link = document.createElement('link')
  link.rel = 'stylesheet'
  link.href = '${FONTS}'
  document.head.appendChild(link)
  const style = document.createElement('style')
  style.textContent = ':root{--safe-t:62px!important;--safe-b:34px!important;--font:Inter,sans-serif!important;--font-serif:"Source Serif 4",serif!important}'
  document.head.appendChild(style)
  const webOnly = /avisos|pantalla de inicio/i
  const hide = () => document.querySelectorAll('.sheet__hint, .sheet__note').forEach((el) => {
    if (webOnly.test(el.textContent || '')) el.style.display = 'none'
  })
  new MutationObserver(hide).observe(document.body, { childList: true, subtree: true })
})`

const server = await preview({ preview: { port: PORT, strictPort: true }, logLevel: 'silent' })
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

/** Abre la app y espera a que el arranque (#boot) haya terminado de fundirse. */
async function open(url) {
  await send('Page.navigate', { url })
  await waitFor(`document.readyState === 'complete' && document.querySelector('.row') && !document.getElementById('boot')`)
  await evaluate('document.fonts.ready.then(() => true)')
  await sleep(500)
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
  const { identifier } = await send('Page.addScriptToEvaluateOnNewDocument', { source: PAGE_SETUP })

  // El estado se escribe desde una página del mismo origen sin la app: si la app estuviera abierta,
  // al recargar guardaría encima lo que tenía en memoria.
  await send('Page.navigate', { url: `${BASE}privacidad.html` })
  await waitFor(`document.readyState === 'complete'`)
  await evaluate(writeStateExpression(sampleState()))

  const screens = {}
  await open(BASE)
  screens.home = await capture()

  await click('.row__main', 'Comprar pan')
  await waitFor(`document.querySelector('.sheet.is-open')`)
  await sleep(900)
  screens.place = await capture()

  await open(BASE)
  await evaluate(`document.querySelector('input[placeholder="Añadir tarea"]').focus()`)
  await send('Input.insertText', { text: 'Cena con Ana el viernes de 9 a 11 de la noche' })
  await waitFor(`[...document.querySelectorAll('button')].some((b) => (b.getAttribute('aria-label') || '').startsWith('Ignorar'))`)
  // La píldora estrecha la barra al aparecer: que se lea el principio de la frase, no un trozo.
  await evaluate(`(() => { const input = document.querySelector('input[placeholder="Añadir tarea"]'); input.setSelectionRange(0, 0); input.scrollLeft = 0; input.blur(); return true })()`)
  await sleep(400)
  screens.write = await capture()

  await open(BASE)
  await click('button', 'Importancia')
  await waitFor(`document.querySelector('.knob')`)
  await sleep(700)
  screens.importance = await capture()

  await open(BASE)
  await click('.nav__tab', 'Semana')
  await waitFor(`document.querySelector('.day')`)
  await sleep(900)
  screens.week = await capture()

  await send('Page.removeScriptToEvaluateOnNewDocument', { identifier })

  const icon = dataUrl(readFileSync('public/icons/icon-192.png'))
  const shots = [
    [
      '1-hoy',
      frame({
        kicker: 'Tasks',
        title: 'Tu día, *en orden*.',
        sub: 'Lo de hoy, lo atrasado y lo que no tiene fecha. Sin cuentas: todo se queda en tu iPhone.',
        content: device(screens.home, 262),
      }),
    ],
    [
      '2-lugares',
      frame({
        theme: 'night',
        kicker: 'Avisos por lugar',
        title: 'Te avisa *al llegar*.',
        sub: 'Pon «al pasar por Mercadona» y el aviso salta cuando llegas, no antes.',
        content:
          device(screens.place, 262) +
          notification({
            icon,
            title: 'Tasks',
            body: '<b>Al llegar a Mercadona</b><br>Comprar pan',
            style: 'left:22px;right:22px;top:318px',
          }),
      }),
    ],
    [
      '3-has-acabado',
      frame({
        theme: 'sand',
        kicker: 'Al acabar',
        title: 'Te pregunta *si has acabado*.',
        sub: 'Táchala desde el propio aviso, sin abrir la app.',
        content:
          device(screens.home, 262, { blurred: true }) +
          notification({
            icon,
            title: 'Reunión con Jorge',
            body: '¿Has acabado? · 17:30–18:30',
            actions: ['Sí, hecha', 'Todavía no'],
            style: 'left:34px;right:34px;top:470px',
          }),
      }),
    ],
    [
      '4-escribir',
      frame({
        kicker: 'Escribe o dicta',
        title: 'Escribe *como hablas*.',
        sub: '«Cena con Ana el viernes de 9 a 11 de la noche». Lo entiende y lo apunta.',
        content:
          device(screens.write, 262) +
          `<div class="float" style="right:16px;top:676px;transform:rotate(-2deg);white-space:nowrap;padding:12px 20px;border-radius:999px;background:#1b2540;color:#f4efe6;font:600 17px Inter;box-shadow:0 20px 44px rgba(20,27,46,.35)">vie 2 oct · 21:00–23:00</div>`,
      }),
    ],
    [
      '5-importancia',
      frame({
        theme: 'night',
        kicker: 'Importancia',
        title: 'Lo importante, *más grande*.',
        sub: 'Arrastra el número: el título crece. Sin etiquetas ni colores.',
        content: device(screens.importance, 262),
      }),
    ],
    [
      '6-semana',
      frame({
        theme: 'sand',
        kicker: 'Semana',
        title: 'Tu semana, *de un vistazo*.',
        sub: 'Arrastra una tarea a otro día. Lo atrasado pasa a hoy de un toque.',
        content: device(screens.week, 262),
      }),
    ],
    ['7-widget', widgetsFrame(icon)],
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

function widgetsFrame(icon) {
  const tasks = [
    { title: 'Pagar la factura de la luz', overdue: true, detail: 'Ayer', weight: 0.3 },
    { title: 'Comprar pan' },
    { title: 'Preparar la presentación', weight: 0.6 },
    { title: 'Enviar el presupuesto', detail: '16:00' },
  ]
  const small = [{ title: 'Comprar pan' }, { title: 'Presentación', weight: 0.6 }, { title: 'Tender la ropa', done: true }]
  return frame({
    theme: 'night',
    kicker: 'Widget y Siri',
    title: 'Siempre *a mano*.',
    sub: 'Táchalas desde el widget. «Apunta en Tasks» y Siri la añade sin abrir nada.',
    content: `
      <div class="float" style="left:34px;top:318px">${mediumWidget(tasks, 4)}</div>
      <div class="float" style="left:34px;top:520px">${smallWidget(small, 4)}</div>
      <div class="float" style="left:236px;top:520px;width:176px;text-align:center">
        <img src="${icon}" style="width:112px;height:112px;border-radius:26px;box-shadow:0 26px 60px rgba(0,0,0,.4)" alt="">
        <div style="margin-top:10px;font:500 14px Inter;color:#f4efe6">Tasks</div>
      </div>
      <div class="float" style="left:34px;right:34px;top:734px;padding:16px 18px;border-radius:22px;background:rgba(244,239,230,.08);box-shadow:inset 0 0 0 1px rgba(244,239,230,.12)">
        <div style="font:500 12px Inter;letter-spacing:.14em;text-transform:uppercase;color:#d6b07f">Siri</div>
        <div style="margin-top:8px;font:italic 500 19px/1.3 'Source Serif 4',serif;color:#f4efe6">«Apunta en Tasks cena con Ana mañana a las 9»</div>
        <div style="margin-top:8px;font:400 13.5px Inter;color:#b3aa9a">Apuntada: Cena con Ana, mañana 21:00</div>
      </div>`,
  })
}
