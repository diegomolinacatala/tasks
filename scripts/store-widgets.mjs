// Los widgets de las capturas, copiados de `ios/App/TasksWidget/TasksWidgetViews.swift` (mismas
// medidas y colores): mediano y pequeño de Hoy, pequeño de Rutinas y los de la pantalla de bloqueo.

import { INK } from './brand.mjs'

const C = {
  bg: '#f4efe6',
  text: INK,
  text3: '#7d7466',
  line: 'rgba(78,58,34,.11)',
  line2: 'rgba(78,58,34,.22)',
  accent: '#8a5a2c',
  accentDim: 'rgba(138,90,44,.12)',
  danger: '#9e3b2e',
}

const circle = (size, { done = false, overdue = false } = {}) =>
  done
    ? `<span style="flex:none;display:grid;place-items:center;width:${size}px;height:${size}px;border-radius:50%;background:${C.accent}"><svg width="${size * 0.5}" height="${size * 0.5}" viewBox="0 0 24 24"><path d="M4.5 12.5 9.5 17.5 19.5 6.5" fill="none" stroke="#f7f2e8" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/></svg></span>`
    : `<span style="flex:none;width:${size}px;height:${size}px;border-radius:50%;border:1.5px solid ${overdue ? 'rgba(158,59,46,.5)' : C.line2}"></span>`

/** Filas de alto fijo, como `TaskList` en Swift. */
function rows(tasks, { circleSize, title, detailed }) {
  return tasks
    .map((task, index) => {
      const color = task.done ? C.text3 : task.overdue ? C.danger : C.text
      const size = title + (task.weight ?? 0) * 5
      const weight = (task.weight ?? 0) >= 0.5 ? 600 : 400
      return `<div style="flex:1;display:flex;align-items:center;gap:${detailed ? 10 : 8}px;${index ? `border-top:.5px solid ${C.line};margin-left:0` : ''}">
        ${circle(circleSize, task)}
        <span style="flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font:${weight} ${size}px Inter;color:${color};${task.done ? `text-decoration:line-through;text-decoration-color:${C.text3}` : ''}">${task.title}</span>
        ${detailed && task.detail ? `<span style="flex:none;font:400 ${title - 3}px Inter;color:${task.overdue ? C.danger : C.text3}">${task.detail}</span>` : ''}
      </div>`
    })
    .join('')
}

const card = (width, height, inner) =>
  `<div style="width:${width}px;height:${height}px;border-radius:26px;padding:16px;background:linear-gradient(160deg,#fbf8f2,${C.bg} 55%,#ede4d4);box-shadow:0 26px 60px rgba(0,0,0,.35),0 0 0 .5px rgba(255,255,255,.4) inset">${inner}</div>`

const count = (value, size) =>
  `<div style="font:400 ${size}px/1 'Source Serif 4',serif;color:${C.text};letter-spacing:-.02em">${value}</div>`
const day = `<div style="margin-top:4px;font:600 11px Inter;letter-spacing:.13em;color:${C.accent}">HOY</div>`
const moveButton = `<div style="display:inline-block;margin-top:8px;padding:0 9px;height:24px;line-height:24px;border-radius:12px;background:${C.accentDim};font:600 12px Inter;color:${C.accent}">A hoy</div>`
const addLink = `<div style="display:grid;place-items:center;width:28px;height:28px;border-radius:50%;background:${C.accentDim}"><svg width="14" height="14" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14" stroke="${C.accent}" stroke-width="2.6" stroke-linecap="round"/></svg></div>`

export function mediumWidget(tasks, pending) {
  return card(
    372,
    176,
    `<div style="display:flex;gap:16px;height:100%">
      <div style="display:flex;flex-direction:column;min-width:52px">${addLink}<div style="flex:1"></div>${count(pending, 36)}${day}${moveButton}</div>
      <div style="flex:1;min-width:0;display:flex;flex-direction:column">${rows(tasks.slice(0, 4), { circleSize: 20, title: 15, detailed: true })}</div>
    </div>`,
  )
}

export function smallWidget(tasks, pending) {
  return card(
    176,
    176,
    `<div style="display:flex;flex-direction:column;height:100%;gap:4px">
      <div style="display:flex;align-items:baseline;gap:6px">${count(pending, 28)}<div style="font:600 11px Inter;letter-spacing:.13em;color:${C.accent}">HOY</div></div>
      <div style="flex:1;display:flex;flex-direction:column">${rows(tasks.slice(0, 3), { circleSize: 17, title: 13, detailed: false })}</div>
    </div>`,
  )
}

/** En la pantalla de bloqueo iOS pinta los emojis en un solo tono, como el resto del widget. */
const lockEmoji = (emoji, size) =>
  `<span style="position:relative;font-size:${size}px;line-height:1;font-family:'Segoe UI Emoji','Apple Color Emoji','Noto Color Emoji',sans-serif;filter:grayscale(1) brightness(1.5)">${emoji}</span>`

/**
 * La pantalla de bloqueo con los widgets de rutinas: un redondo con una rutina elegida y ya hecha
 * (anillo lleno y la marca), otro con una pendiente (su emoji) y el rectangular con la siguiente que
 * queda, también con su emoji. Blanco translúcido sobre el fondo, como los pinta iOS.
 */
export function lockScreenRoutines({ date, title, detail, emoji, pending }) {
  const ring = (value, inner) => `
    <div style="flex:none;position:relative;width:64px;height:64px;border-radius:50%;background:rgba(255,255,255,.14);display:grid;place-items:center">
      <svg width="64" height="64" viewBox="0 0 64 64" style="position:absolute;inset:0">
        <circle cx="32" cy="32" r="25" fill="none" stroke="rgba(255,255,255,.28)" stroke-width="5"/>
        ${value > 0 ? `<circle cx="32" cy="32" r="25" fill="none" stroke="#fff" stroke-width="5" stroke-linecap="round" stroke-dasharray="${157 * value} 157" transform="rotate(-90 32 32)"/>` : ''}
      </svg>
      ${inner}
    </div>`
  const check = `<span style="position:relative;font:700 22px Inter;color:#fff">✓</span>`
  return `
    <div style="width:372px;padding:22px 20px 24px;border-radius:30px;background:linear-gradient(170deg,#2b3654,#141b2e 70%);box-shadow:0 30px 70px rgba(0,0,0,.4)">
      <div style="text-align:center;font:500 15px Inter;color:rgba(255,255,255,.8)">${date}</div>
      <div style="text-align:center;font:600 76px/1 Inter;letter-spacing:-.03em;color:#fff;margin-top:2px">9:41</div>
      <div style="display:flex;gap:12px;align-items:center;margin-top:18px">
        ${ring(1, check)}
        ${ring(0, lockEmoji(pending, 25))}
        <div style="flex:1;min-width:0;display:flex;gap:9px;align-items:center;height:64px;padding:0 12px;border-radius:18px;background:rgba(255,255,255,.14)">
          ${lockEmoji(emoji, 24)}
          <span style="min-width:0">
            <span style="display:block;font:600 15.5px Inter;color:#fff;white-space:nowrap">${title}</span>
            <span style="display:block;font:400 12.5px Inter;color:rgba(255,255,255,.72);white-space:nowrap">${detail}</span>
          </span>
        </div>
      </div>
    </div>`
}

/** Widget pequeño de Rutinas (`RoutineSmall` en Swift): las de hoy con su círculo y su emoji. */
export function routinesWidget(routines) {
  const done = routines.filter((routine) => routine.done).length
  const rowsHtml = routines
    .slice(0, 4)
    .map(
      (routine) => `<div style="flex:1;display:flex;align-items:center;gap:8px">
        ${circle(17, routine)}
        <span style="flex:none;font-size:13px;line-height:1;font-family:'Segoe UI Emoji','Apple Color Emoji','Noto Color Emoji',sans-serif;filter:saturate(.55);opacity:${routine.done ? 0.5 : 1}">${routine.emoji}</span>
        <span style="flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font:400 13px Inter;color:${routine.done ? C.text3 : C.text};${routine.done ? `text-decoration:line-through;text-decoration-color:${C.text3}` : ''}">${routine.title}</span>
      </div>`,
    )
    .join('')
  return card(
    176,
    176,
    `<div style="display:flex;flex-direction:column;height:100%;gap:6px">
      <div style="display:flex;align-items:baseline;justify-content:space-between">
        <div style="font:600 11px Inter;letter-spacing:.13em;color:${C.accent}">RUTINAS</div>
        <div style="font:400 15px 'Source Serif 4',serif;color:${C.text3}">${done}/${routines.length}</div>
      </div>
      <div style="flex:1;display:flex;flex-direction:column">${rowsHtml}</div>
    </div>`,
  )
}
