/**
 * El buzón de sugerencias: una página para el desarrollador, servida por el propio Worker en /buzon.
 * No lleva datos dentro: los pide con la clave (`FEEDBACK_KEY`), que se guarda en ese navegador. Todo
 * lo que escriben los usuarios se pinta con `textContent`, nunca como HTML.
 */
const STYLE = `
:root { color-scheme: light dark; --bg: #f6f1e6; --card: #fbf8f2; --ink: #1d2a44; --ink-2: #5b6274; --line: #e3dccd;
  --accent: #8a5a2c; --danger: #a4402c; --serif: ui-serif, 'New York', Georgia, serif; }
@media (prefers-color-scheme: dark) { :root { --bg: #121828; --card: #1a2236; --ink: #f1ead9; --ink-2: #b4b0a6;
  --line: #2b344b; --accent: #d9b48c; --danger: #e09a86; } }
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--ink); font: 16px/1.45 -apple-system, system-ui, sans-serif;
  padding: max(16px, env(safe-area-inset-top)) 16px max(24px, env(safe-area-inset-bottom)); }
main { max-width: 720px; margin: 0 auto; }
header { display: flex; align-items: center; gap: 8px; margin: 8px 0 4px; }
h1 { font: 600 32px/1.1 var(--serif); margin: 0; flex: 1; }
.count { color: var(--ink-2); font-size: 14px; margin: 0 0 20px; }
button, input { font: inherit; }
button { border: 1px solid var(--line); background: var(--card); color: var(--ink); border-radius: 999px; padding: 6px 14px; }
button.primary { background: var(--ink); color: var(--bg); border-color: var(--ink); }
button.danger { color: var(--danger); }
form { display: flex; gap: 8px; margin-top: 24px; }
input { flex: 1; min-width: 0; padding: 10px 14px; border-radius: 12px; border: 1px solid var(--line); background: var(--card); color: var(--ink); }
.card { background: var(--card); border: 1px solid var(--line); border-radius: 18px; padding: 16px; margin-bottom: 16px; }
.when { font: 600 15px var(--serif); }
.chips { display: flex; flex-wrap: wrap; gap: 6px; margin: 8px 0 12px; }
.chip { font-size: 12px; color: var(--ink-2); border: 1px solid var(--line); border-radius: 999px; padding: 2px 9px; }
.message { white-space: pre-wrap; overflow-wrap: anywhere; font-size: 17px; margin: 0 0 12px; }
.shot { display: block; max-width: 46%; max-height: 420px; border-radius: 12px; border: 1px solid var(--line); cursor: zoom-in; }
.shot.is-big { max-width: 100%; max-height: none; cursor: zoom-out; }
.where { font-size: 13px; color: var(--ink-2); margin: 12px 0 0; }
ul { margin: 6px 0 0; padding-left: 18px; font: 12px/1.5 ui-monospace, Menlo, monospace; color: var(--ink-2); overflow-wrap: anywhere; }
.actions { display: flex; gap: 8px; margin-top: 14px; }
.empty, .error { color: var(--ink-2); font: italic 18px var(--serif); text-align: center; margin-top: 48px; }
.error { color: var(--danger); }
`

const SCRIPT = `
const STORAGE = 'tasks:buzon-key'
const main = document.querySelector('main')
let key = null
try { key = localStorage.getItem(STORAGE) } catch {}

// Las capturas se piden al acercarse a la pantalla: todas de golpe toparían con el límite por IP.
const shots = new IntersectionObserver((entries) => {
  for (const entry of entries) {
    if (!entry.isIntersecting) continue
    const image = entry.target
    shots.unobserve(image)
    api('/v1/feedback/' + image.dataset.id + '/shot')
      .then((response) => response.blob())
      .then((blob) => { image.src = URL.createObjectURL(blob) })
      .catch(() => image.replaceWith(el('p', 'where', 'Captura no disponible.')))
  }
}, { rootMargin: '400px' })

function el(tag, className, text) {
  const node = document.createElement(tag)
  if (className) node.className = className
  if (text !== undefined) node.textContent = text
  return node
}

async function api(path, init) {
  const response = await fetch(path, { ...init, headers: { authorization: 'Bearer ' + key } })
  if (response.status === 401) { forget(); throw new Error('Clave incorrecta.') }
  if (!response.ok) throw new Error('Error ' + response.status)
  return response
}

function forget() {
  key = null
  try { localStorage.removeItem(STORAGE) } catch {}
}

function login(error) {
  main.replaceChildren()
  const head = el('header')
  head.append(el('h1', '', 'Buzón'))
  const form = el('form')
  const input = el('input')
  input.type = 'password'
  input.placeholder = 'Clave'
  input.autocomplete = 'current-password'
  const enter = el('button', 'primary', 'Entrar')
  form.append(input, enter)
  form.addEventListener('submit', (event) => {
    event.preventDefault()
    key = input.value.trim()
    if (!key) return
    try { localStorage.setItem(STORAGE, key) } catch {}
    void load()
  })
  main.append(head, form)
  if (error) main.append(el('p', 'error', error))
  input.focus()
}

function parse(context) {
  try { return JSON.parse(context) } catch { return {} }
}

function summary(item, context) {
  const app = context.app || {}
  const lines = [
    'Sugerencia del ' + new Date(item.at).toLocaleString('es-ES') + ' — ' + (app.platform === 'ios' ? 'iPhone' : 'web') + ' ' + (app.version || '') + ', ' + (app.language || '') + ', ' + (app.theme || '') + ', ' + (context.device || ''),
    'Pantalla: ' + (context.screen || '?') + (context.sheet ? ' · panel «' + context.sheet + '»' : ''),
  ]
  if (context.region && context.viewport) {
    const r = context.region
    lines.push('Zona rodeada: x ' + r.x + ', y ' + r.y + ', ' + r.width + ' × ' + r.height + ' de una pantalla de ' + context.viewport.width + ' × ' + context.viewport.height)
  }
  if (context.elements && context.elements.length) lines.push('Lo rodeado:', ...context.elements.map((line) => '- ' + line))
  lines.push('Mensaje:', item.message)
  return lines.join('\\n')
}

function card(item) {
  const context = parse(item.context)
  const app = context.app || {}
  const node = el('article', 'card')
  node.append(el('div', 'when', new Date(item.at).toLocaleString('es-ES', { dateStyle: 'full', timeStyle: 'short' })))
  const chips = el('div', 'chips')
  const labels = [
    (context.screen || '') + (context.sheet ? ' · ' + context.sheet : ''),
    app.platform === 'ios' ? 'iPhone ' + (app.version || '') : 'Web',
    app.language === 'en' ? 'English' : 'Español',
    app.theme === 'dark' ? 'Oscuro' : 'Claro',
    context.device || '',
  ]
  for (const label of labels) if (label.trim()) chips.append(el('span', 'chip', label.trim()))
  node.append(chips, el('p', 'message', item.message))
  if (item.hasShot) {
    const image = el('img', 'shot')
    image.alt = 'Captura con lo rodeado'
    image.dataset.id = item.id
    image.addEventListener('click', () => image.classList.toggle('is-big'))
    node.append(image)
    shots.observe(image)
  }
  if (context.elements && context.elements.length) {
    node.append(el('p', 'where', 'Lo rodeado'))
    const list = el('ul')
    for (const line of context.elements) list.append(el('li', '', line))
    node.append(list)
  }
  const actions = el('div', 'actions')
  const copy = el('button', '', 'Copiar')
  copy.addEventListener('click', () => {
    void navigator.clipboard.writeText(summary(item, context)).then(() => { copy.textContent = 'Copiada' })
  })
  const archive = el('button', 'danger', 'Archivar')
  archive.addEventListener('click', async () => {
    if (!confirm('¿Archivarla? Se borra del buzón.')) return
    try {
      await api('/v1/feedback/' + item.id, { method: 'DELETE' })
      node.remove()
    } catch (error) { alert(error.message) }
  })
  actions.append(copy, archive)
  node.append(actions)
  return node
}

async function load() {
  if (!key) return login()
  let items
  try {
    items = (await (await api('/v1/feedback')).json()).data
  } catch (error) {
    return key ? (main.replaceChildren(el('p', 'error', error.message))) : login(error.message)
  }
  main.replaceChildren()
  const head = el('header')
  const refresh = el('button', '', 'Actualizar')
  refresh.addEventListener('click', () => void load())
  const out = el('button', '', 'Salir')
  out.addEventListener('click', () => { forget(); login() })
  head.append(el('h1', '', 'Buzón'), refresh, out)
  main.append(head, el('p', 'count', items.length === 1 ? '1 sugerencia' : items.length + ' sugerencias'))
  if (!items.length) main.append(el('p', 'empty', 'No hay sugerencias.'))
  for (const item of items) main.append(card(item))
}

void load()
`

export function inboxPage(nonce: string): string {
  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="robots" content="noindex">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-title" content="Buzón">
<title>Buzón · Tasks</title>
<style nonce="${nonce}">${STYLE}</style>
</head>
<body>
<main></main>
<script nonce="${nonce}">${SCRIPT}</script>
</body>
</html>`
}
