// Los widgets de la captura 7, copiados de `ios/App/TasksWidget/TasksWidgetViews.swift` (mismas
// medidas y colores): mediano y pequeño, más el icono de la app.

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
