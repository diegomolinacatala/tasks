// Edge sin ventana por el protocolo de depuración (WebSocket de Node 22+), sin dependencias.
// Lo usan los iconos (SVG → PNG) y las capturas de la App Store.
import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { deflateSync, inflateSync } from 'node:zlib'

const BROWSERS = [
  process.env.EDGE_PATH,
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].filter(Boolean)

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function findBrowser() {
  const { existsSync } = await import('node:fs')
  const found = BROWSERS.find((path) => existsSync(path))
  if (!found) throw new Error('No encuentro Edge ni Chrome: indica la ruta con EDGE_PATH')
  return found
}

/** Arranca el navegador y devuelve una sesión CDP sobre su primera pestaña. */
export async function launch({ port = 9333 } = {}) {
  const profile = mkdtempSync(join(tmpdir(), 'tasks-edge-'))
  const child = spawn(
    await findBrowser(),
    ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, '--hide-scrollbars', '--force-color-profile=srgb', 'about:blank'],
    { stdio: 'ignore' },
  )

  let socketUrl = null
  for (let i = 0; i < 60 && !socketUrl; i += 1) {
    try {
      const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()
      socketUrl = targets.find((target) => target.type === 'page')?.webSocketDebuggerUrl ?? null
    } catch {
      // Aún arrancando.
    }
    if (!socketUrl) await sleep(200)
  }
  if (!socketUrl) {
    child.kill()
    throw new Error('El navegador no responde en el puerto de depuración')
  }

  const ws = new WebSocket(socketUrl)
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
      next += 1
      pending.set(next, { resolve, reject })
      ws.send(JSON.stringify({ id: next, method, params }))
    })

  const evaluate = async (expression) => {
    const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description ?? 'error en la página')
    return result.result.value
  }

  const close = () => {
    ws.close()
    child.kill()
    // Edge tarda un poco en soltar el perfil.
    setTimeout(() => rmSync(profile, { recursive: true, force: true }), 800).unref()
  }

  await send('Page.enable')
  await send('Runtime.enable')
  return { send, evaluate, close }
}

/**
 * Pinta `html` a `width` × `height` CSS px con `scale` píxeles por px y devuelve el PNG.
 * `transparent`: sin fondo blanco por debajo (la señal suelta de la pantalla de carga).
 * `ready`: expresión que se espera antes de fotografiar (por defecto, la letra).
 */
export async function renderHtml(session, html, { width, height, scale = 1, transparent = false, ready = null }) {
  await session.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: scale, mobile: false })
  await session.send('Emulation.setDefaultBackgroundColorOverride', transparent ? { color: { r: 0, g: 0, b: 0, a: 0 } } : {})
  const { frameId } = await session.send('Page.getFrameTree').then((tree) => ({ frameId: tree.frameTree.frame.id }))
  await session.send('Page.navigate', { url: 'about:blank' })
  await session.send('Page.setDocumentContent', { frameId, html })
  await session.evaluate(
    ready ?? 'document.fonts.ready.then(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))))',
  )
  const { data } = await session.send('Page.captureScreenshot', {
    format: 'png',
    clip: { x: 0, y: 0, width, height, scale: 1 },
    captureBeyondViewport: false,
  })
  return Buffer.from(data, 'base64')
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})

function crc32(buffer) {
  let crc = 0xffffffff
  for (const byte of buffer) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([length, body, crc])
}

/**
 * PNG de 8 bits a partir de píxeles RGBA. `opaque`: sin canal alfa. Apple rechaza el icono de la
 * App Store si lo lleva, aunque sea 255.
 */
export function encodePng({ width, height, pixels }, opaque = false) {
  const channels = opaque ? 3 : 4
  const header = Buffer.alloc(13)
  header.writeUInt32BE(width, 0)
  header.writeUInt32BE(height, 4)
  header[8] = 8
  header[9] = opaque ? 2 : 6
  const stride = width * channels
  const raw = Buffer.alloc((stride + 1) * height)
  for (let y = 0; y < height; y += 1) {
    const row = y * (stride + 1)
    for (let x = 0; x < width; x += 1) {
      const from = (y * width + x) * 4
      pixels.copy(raw, row + 1 + x * channels, from, from + channels)
    }
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

/** Lee un PNG de 8 bits (RGB o RGBA, sin entrelazar) y devuelve sus píxeles RGBA. */
export function decodePng(buffer) {
  let offset = 8
  let width = 0
  let height = 0
  let colorType = 0
  const idat = []
  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset)
    const type = buffer.toString('ascii', offset + 4, offset + 8)
    const data = buffer.subarray(offset + 8, offset + 8 + length)
    if (type === 'IHDR') {
      width = data.readUInt32BE(0)
      height = data.readUInt32BE(4)
      if (data[8] !== 8 || data[12] !== 0) throw new Error('PNG no soportado')
      colorType = data[9]
    } else if (type === 'IDAT') idat.push(data)
    offset += length + 12
  }
  const channels = colorType === 6 ? 4 : colorType === 2 ? 3 : 0
  if (!channels) throw new Error(`Tipo de color PNG no soportado: ${colorType}`)
  const raw = inflateSync(Buffer.concat(idat))
  const stride = width * channels
  const out = Buffer.alloc(width * height * 4)
  let previous = Buffer.alloc(stride)
  for (let y = 0; y < height; y += 1) {
    const filter = raw[y * (stride + 1)]
    const line = Buffer.from(raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1)))
    for (let x = 0; x < stride; x += 1) {
      const left = x >= channels ? line[x - channels] : 0
      const up = previous[x]
      const upLeft = x >= channels ? previous[x - channels] : 0
      let add = 0
      if (filter === 1) add = left
      else if (filter === 2) add = up
      else if (filter === 3) add = (left + up) >> 1
      else if (filter === 4) {
        const p = left + up - upLeft
        const pa = Math.abs(p - left)
        const pb = Math.abs(p - up)
        const pc = Math.abs(p - upLeft)
        add = pa <= pb && pa <= pc ? left : pb <= pc ? up : upLeft
      }
      line[x] = (line[x] + add) & 0xff
    }
    for (let x = 0; x < width; x += 1) {
      const to = (y * width + x) * 4
      line.copy(out, to, x * channels, x * channels + 3)
      out[to + 3] = channels === 4 ? line[x * channels + 3] : 255
    }
    previous = line
  }
  return { width, height, pixels: out }
}
