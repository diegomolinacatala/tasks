// Iconos y señal de la pantalla de carga a partir de la marca (`brand.mjs`), pintados con Edge sin
// ventana. Los PNG se reescriben al salir de Edge: el del icono sin canal alfa (lo exige Apple).
//
//   npm run icons
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { LAUNCH_MARK_PT, NIGHT_INK, faviconSvg, iconSvg, markSvg } from './brand.mjs'
import { decodePng, encodePng, launch, renderHtml } from './edge.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const WEB = join(ROOT, 'public', 'icons')
const ASSETS = join(ROOT, 'ios', 'App', 'App', 'Assets.xcassets')

const page = (svg, size) =>
  `<!doctype html><html><head><style>html,body{margin:0;background:transparent}svg{display:block;width:${size}px;height:${size}px}</style></head><body>${svg}</body></html>`

const session = await launch()

async function write(path, svg, size, { opaque = true, scale = 1 } = {}) {
  const png = await renderHtml(session, page(svg, size), { width: size, height: size, scale, transparent: !opaque })
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, encodePng(decodePng(png), opaque))
  console.log(path.slice(ROOT.length + 1).replace(/\\/g, '/'))
}

try {
  // PWA
  await write(join(WEB, 'icon-192.png'), iconSvg(), 192)
  await write(join(WEB, 'icon-512.png'), iconSvg(), 512)
  // "maskable": Android recorta un círculo; el dibujo cabe en el 80 % central.
  await write(join(WEB, 'icon-maskable-512.png'), iconSvg({ inset: 0.8 }), 512)
  await write(join(WEB, 'apple-touch-icon.png'), iconSvg(), 180)
  writeFileSync(join(WEB, 'favicon.svg'), faviconSvg())
  console.log('public/icons/favicon.svg')

  // iPhone: un solo icono de 1024 px por apariencia (Xcode saca el resto)
  await write(join(ASSETS, 'AppIcon.appiconset', 'AppIcon-512@2x.png'), iconSvg(), 1024)
  await write(join(ASSETS, 'AppIcon.appiconset', 'AppIcon-dark.png'), iconSvg({ night: true }), 1024)

  // Señal de la pantalla de carga, con fondo transparente, a 1x, 2x y 3x; en marfil para el modo oscuro
  for (const scale of [1, 2, 3]) {
    const suffix = scale === 1 ? '' : `@${scale}x`
    await write(join(ASSETS, 'LaunchMark.imageset', `launch-mark${suffix}.png`), markSvg({ size: LAUNCH_MARK_PT }), LAUNCH_MARK_PT, {
      opaque: false,
      scale,
    })
    await write(
      join(ASSETS, 'LaunchMark.imageset', `launch-mark-dark${suffix}.png`),
      markSvg({ size: LAUNCH_MARK_PT, color: NIGHT_INK }),
      LAUNCH_MARK_PT,
      { opaque: false, scale },
    )
  }
} finally {
  session.close()
}
