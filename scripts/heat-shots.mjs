// Capturas de referencia del mapa de calor del panel de uso (worker/panel/uso/shots/<pantalla>.webp):
// la app de verdad con el estado de ejemplo, a 390 × 844 (el tamaño con el que se pintan los toques).
// Cada una se llama como el `data-screen` de su pantalla. Rehacerlas cuando cambie una pantalla:
//   node scripts/heat-shots.mjs
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { build, preview } from 'vite'
import { launch, sleep } from './edge.mjs'
import { sampleState, writeStateExpression } from './sample-state.mjs'
import { FONTS } from './store-frames.mjs'

const PORT = 4175
const BASE = `http://localhost:${PORT}/tasks/`
const DIST = 'dist-shots'
const OUT = 'worker/panel/uso/shots'

/** La hora fija de las capturas de la App Store: la marca de "ahora" cae a media mañana. */
const PAGE_SETUP = `
;(() => {
  const RealDate = Date
  const target = new RealDate()
  target.setHours(11, 20, 0, 0)
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
  style.textContent = ':root{--safe-t:47px!important;--safe-b:34px!important;--font:Inter,sans-serif!important;--font-serif:"Source Serif 4",serif!important}'
  document.head.appendChild(style)
})`

await build({ mode: 'shots', logLevel: 'warn', build: { outDir: DIST, emptyOutDir: true, sourcemap: false } })
mkdirSync(OUT, { recursive: true })
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

const run = (code) => evaluate(`(() => { ${code}; return true })()`)
const tab = (index) => run(`document.querySelectorAll('.tabs__tab')[${index}].click()`)
const clickFirst = (selector) => run(`document.querySelector(${JSON.stringify(selector)}).click()`)
const closeSheet = async () => {
  await run(`document.querySelector('.sheet.is-open .sheet__scrim')?.click()`)
  await sleep(500)
}

async function shot(screen) {
  await sleep(700)
  const { data } = await send('Page.captureScreenshot', { format: 'webp', quality: 70 })
  writeFileSync(join(OUT, `${screen}.webp`), Buffer.from(data, 'base64'))
  console.log(`${screen}.webp`)
}

try {
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true })
  await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 })
  // Sin ventana, la página no tiene el foco: sin esto, enfocar la barra de escribir no la abre.
  await send('Emulation.setFocusEmulationEnabled', { enabled: true })
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'light' }] })
  await send('Storage.clearDataForOrigin', { origin: `http://localhost:${PORT}`, storageTypes: 'all' })
  await send('Page.addScriptToEvaluateOnNewDocument', { source: PAGE_SETUP })

  // El estado se escribe desde una página sin la app: si no, al salir guardaría encima.
  await send('Page.navigate', { url: `${BASE}privacidad.html` })
  await waitFor(`document.readyState === 'complete'`)
  await evaluate(writeStateExpression(sampleState({ theme: 'light', language: 'es' })))
  await send('Page.navigate', { url: BASE })
  await waitFor(`document.readyState === 'complete' && document.querySelector('.row') && !document.getElementById('boot')`)
  await evaluate('document.fonts.ready.then(() => true)')

  await shot('agenda')
  await clickFirst('.tl-row .tl__body')
  await waitFor(`document.querySelector('.sheet.is-open')`)
  await shot('task')
  await closeSheet()

  await run(`document.querySelector('.composer__input').focus()`)
  await waitFor(`document.querySelector('.app.is-composing')`)
  await shot('composer')
  await clickFirst('.composer__more')
  await waitFor(`document.querySelector('.sheet.is-open')`)
  await shot('compose')
  await closeSheet()
  await run(`document.activeElement?.blur()`)

  await clickFirst('.app__basket')
  await waitFor(`document.querySelector('.basket.is-open')`)
  await shot('basket')
  await run(`document.querySelector('.basket__scrim').click()`)
  await sleep(500)

  await tab(0)
  await waitFor(`document.querySelector('.routine__main')`)
  await shot('inbox')
  await clickFirst('.routine__main')
  await waitFor(`document.querySelector('.sheet.is-open')`)
  await shot('routine')
  await closeSheet()

  await tab(2)
  await waitFor(`document.querySelector('.place-card')`)
  await shot('places')
  await clickFirst('.place-card')
  await waitFor(`document.querySelector('.sheet.is-open')`)
  await shot('place')
  await closeSheet()

  await tab(3)
  await waitFor(`document.querySelector('.settings-row')`)
  await shot('settings')
} finally {
  await session.close()
  await new Promise((resolve) => server.httpServer.close(resolve))
}
