// Plantillas de las capturas de la App Store: titular en serif, el iPhone con la app real dentro y
// un detalle que sale del marco (un aviso, la píldora de lo entendido, los widgets). Todo en
// 440 × 956 px CSS, que a 3x son los 1320 × 2868 px del iPhone de 6,9".

import { GOLD, INK } from './brand.mjs'

export const FONTS =
  'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Source+Serif+4:ital,opsz,wght@0,8..60,400..700;1,8..60,400..700&display=block'

/** Fondos: papel, azul noche y arena, alternados para que la tira tenga ritmo. */
const THEMES = {
  paper: { bg: '#f4efe6', glow: '#fbf8f2', title: INK, accent: '#8a5a2c', sub: '#5a544a' },
  night: { bg: '#141b2e', glow: '#26304a', title: '#f4efe6', accent: '#d6b07f', sub: '#b3aa9a' },
  sand: { bg: '#e9dfcc', glow: '#f5eee1', title: INK, accent: '#8a5a2c', sub: '#5a544a' },
}

const BASE_CSS = `
*{box-sizing:border-box;margin:0}
html,body{width:440px;height:956px;overflow:hidden}
body{position:relative;font-family:Inter,sans-serif;-webkit-font-smoothing:antialiased}
.bg{position:absolute;inset:0}
.grain{position:absolute;inset:0;opacity:.35;mix-blend-mode:multiply;background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='2' stitchTiles='stitch'/%3E%3CfeColorMatrix values='0 0 0 0 .3 0 0 0 0 .22 0 0 0 0 .12 0 0 0 .09 0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")}
.head{position:absolute;left:0;right:0;top:58px;padding:0 30px;text-align:center}
.kicker{display:inline-flex;align-items:center;gap:8px;font:600 11px/1 Inter;letter-spacing:.2em;text-transform:uppercase}
.kicker i{display:block;width:22px;height:1px}
h1{margin-top:14px;font-family:'Source Serif 4',serif;font-optical-sizing:auto;font-weight:600;font-size:43px;line-height:1.02;letter-spacing:-.02em}
h1 em{font-weight:500;font-style:italic}
.sub{margin:12px auto 0;max-width:330px;font:400 14.5px/1.4 Inter}
.device{position:absolute;left:50%;width:318px;height:670px;margin-left:-159px;border-radius:56px;padding:9px;background:linear-gradient(145deg,#2a2d35,#0d0f14 40%,#23262e);box-shadow:inset 0 0 0 1.5px #474b55,0 44px 80px rgba(20,27,46,.34),0 14px 30px rgba(20,27,46,.18)}
.screen{position:relative;width:100%;height:100%;border-radius:47px;overflow:hidden;background:#f4efe6}
.screen img{display:block;width:100%}
.island{position:absolute;top:11px;left:50%;width:92px;height:27px;margin-left:-46px;border-radius:20px;background:#000}
.status{position:absolute;top:15px;left:0;right:0;display:flex;justify-content:space-between;padding:0 28px 0 33px;font:600 13.5px Inter}
.status svg{display:block}
.float{position:absolute;z-index:3}
`

/** Barra de estado del iPhone, en tinta o en marfil (captura en modo oscuro). */
const statusBar = (ink) => `<div class="status" style="color:${ink}"><span>9:41</span><span style="display:flex;gap:5px;align-items:center">
<svg width="17" height="11" viewBox="0 0 17 11"><g fill="${ink}"><rect x="0" y="7" width="3" height="4" rx=".8"/><rect x="4.5" y="5" width="3" height="6" rx=".8"/><rect x="9" y="2.5" width="3" height="8.5" rx=".8"/><rect x="13.5" y="0" width="3" height="11" rx=".8"/></g></svg>
<svg width="15" height="11" viewBox="0 0 15 11"><path fill="${ink}" d="M7.5 2.2c2.1 0 4 .8 5.4 2.1l1.1-1.1C12.3 1.6 10 .6 7.5.6S2.7 1.6 1 3.2l1.1 1.1C3.5 3 5.4 2.2 7.5 2.2Zm0 3.2c1.2 0 2.3.5 3.1 1.2l1.1-1.1C10.6 4.5 9.1 3.8 7.5 3.8S4.4 4.5 3.3 5.5l1.1 1.1c.8-.7 1.9-1.2 3.1-1.2Zm0 3.2c-.4 0-.8.2-1.1.4l1.1 1.2 1.1-1.2c-.3-.2-.7-.4-1.1-.4Z"/></svg>
<svg width="25" height="12" viewBox="0 0 25 12"><rect x=".5" y=".5" width="21" height="11" rx="3.2" fill="none" stroke="${ink}" opacity=".45"/><rect x="2" y="2" width="16" height="8" rx="2" fill="${ink}"/><rect x="22.6" y="4" width="1.6" height="4" rx=".8" fill="${ink}" opacity=".45"/></svg>
</span></div>`

/**
 * El iPhone con una captura de la app dentro. `blurred`: la app difuminada detrás, como cuando se
 * mantiene pulsado un aviso. `dark`: la app en modo oscuro (barra de estado en marfil).
 */
export function device(screenshot, top, { blurred = false, dark = false } = {}) {
  const img = blurred
    ? `<img src="${screenshot}" alt="" style="filter:blur(7px) saturate(.9) brightness(.92);transform:scale(1.06)">`
    : `<img src="${screenshot}" alt="">`
  const screen = dark ? 'background:#121828' : ''
  return `<div class="device" style="top:${top}px"><div class="screen" style="${screen}">${img}${statusBar(dark ? '#ece4d4' : INK)}<div class="island"></div></div></div>`
}

/** Aviso de iOS (con los botones si se mantiene pulsado). */
export function notification({ icon, title, body, when = 'ahora', actions = [], style = '' }) {
  const buttons = actions.length
    ? `<div style="margin-top:8px;border-radius:18px;overflow:hidden;background:rgba(250,248,244,.97);-webkit-backdrop-filter:blur(24px);backdrop-filter:blur(24px);box-shadow:0 18px 40px rgba(20,27,46,.25)">${actions
        .map(
          (label, i) =>
            `<div style="padding:13px 18px;font:500 15px Inter;color:${INK};${i ? 'border-top:1px solid rgba(20,27,46,.1)' : ''}">${label}</div>`,
        )
        .join('')}</div>`
    : ''
  return `<div class="float" style="${style}">
  <div style="display:flex;gap:11px;padding:12px 14px;border-radius:20px;background:rgba(250,248,244,.97);-webkit-backdrop-filter:blur(24px);backdrop-filter:blur(24px);box-shadow:0 22px 48px rgba(20,27,46,.28),0 0 0 .5px rgba(20,27,46,.08)">
    <img src="${icon}" style="width:36px;height:36px;border-radius:9px;flex:none" alt="">
    <div style="flex:1;min-width:0">
      <div style="display:flex;justify-content:space-between;font:600 13.5px Inter;color:${INK}"><span>${title}</span><span style="font-weight:400;color:#8a8579;font-size:12.5px">${when}</span></div>
      <div style="margin-top:2px;font:400 13.5px/1.3 Inter;color:#2b3350">${body}</div>
    </div>
  </div>${buttons}</div>`
}

/** Página completa: fondo, titular (con una palabra en cursiva) y el contenido. */
export function frame({ theme = 'paper', kicker, title, sub, content }) {
  const t = THEMES[theme]
  return `<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="${FONTS}"><style>${BASE_CSS}</style></head>
<body style="background:${t.bg}">
  <div class="bg" style="background:radial-gradient(120% 70% at 50% 18%,${t.glow} 0%,${t.bg} 62%)"></div>
  <div class="grain"></div>
  <div class="head">
    <div class="kicker" style="color:${t.accent}"><i style="background:${GOLD}"></i>${kicker}<i style="background:${GOLD}"></i></div>
    <h1 style="color:${t.title}">${title.replace(/\*(.+?)\*/g, `<em style="color:${t.accent}">$1</em>`)}</h1>
    <p class="sub" style="color:${t.sub}">${sub}</p>
  </div>
  ${content}
</body></html>`
}

/** Espera a la letra y a las imágenes antes de fotografiar. */
export const READY = `(async () => {
  const link = document.querySelector('link[rel=stylesheet]')
  if (link && !link.sheet) await new Promise((r) => { link.onload = r; link.onerror = r })
  await Promise.all(['600 43px "Source Serif 4"', 'italic 500 43px "Source Serif 4"', '400 14px Inter', '600 14px Inter'].map((f) => document.fonts.load(f)))
  await document.fonts.ready
  await Promise.all([...document.images].map((img) => img.decode().catch(() => {})))
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
  return true
})()`
