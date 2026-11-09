// El panel de uso de Tasks: cuánta gente la usa, cómo y dónde toca. Solo contadores anónimos, que el
// Worker ya da sumados; nada de aquí permite ver a nadie en particular (ver `K` en model.js).

import { AuthError, fetchSummary, forgetKey, hasKey, saveKey } from './api.js'
import { el, hideTip } from './charts.js'
import { heatSection } from './heatSection.js'
import { screenLabel } from './labels.js'
import { K, PRESETS, localDay, rangeFor, shape } from './model.js'
import { audience, devices, features, frequency, performance, returning, screens } from './sections.js'

const app = document.getElementById('app')
const PREF = 'tasks:uso-periodo'
const state = { preset: '30', version: null, versions: [], loading: false }
try {
  state.preset = localStorage.getItem(PREF) ?? '30'
} catch {
  state.preset = '30'
}

const dateline = new Intl.DateTimeFormat('es-ES', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })

function masthead() {
  const head = el('header', 'masthead')
  const top = el('div', 'masthead__top')
  top.append(el('span', 'kicker', 'Tasks · Panel'))
  const nav = el('nav', 'nav')
  const inbox = el('a', 'link', 'Buzón')
  inbox.href = '/buzon'
  const out = el('button', 'link', 'Salir')
  out.type = 'button'
  out.addEventListener('click', () => {
    forgetKey()
    login()
  })
  nav.append(inbox, out)
  top.append(nav)
  head.append(top, el('h1', '', 'Cómo se usa Tasks'), el('p', 'dateline', `Edición del ${dateline.format(new Date())}`))
  return head
}

function filters() {
  const row = el('div', 'filters')
  row.setAttribute('role', 'toolbar')
  row.setAttribute('aria-label', 'Periodo y versión')
  for (const preset of PRESETS) {
    const chip = el('button', 'chip', preset.label)
    chip.type = 'button'
    chip.setAttribute('aria-pressed', String(state.preset === preset.id))
    chip.addEventListener('click', () => {
      state.preset = preset.id
      try {
        localStorage.setItem(PREF, preset.id)
      } catch {
        // Solo se recuerda si se puede.
      }
      void load()
    })
    row.append(chip)
  }
  const select = el('select', 'chip chip--select')
  select.setAttribute('aria-label', 'Versión')
  const all = el('option', '', 'Todas las versiones')
  all.value = ''
  select.append(all)
  for (const version of state.versions) {
    const option = el('option', '', `Versión ${version}`)
    option.value = version
    option.selected = version === state.version
    select.append(option)
  }
  select.addEventListener('change', () => {
    state.version = select.value || null
    void load()
  })
  row.append(select)
  const refresh = el('button', 'chip', 'Actualizar')
  refresh.type = 'button'
  refresh.addEventListener('click', () => void load())
  row.append(refresh)
  return row
}

function footer(model) {
  const foot = el('footer', 'colophon')
  foot.append(
    el(
      'p',
      '',
      `Solo contadores: ningún dispositivo manda un identificador y el servidor no guarda ni la IP ni los lotes. Con menos de ${K} dispositivos, los desgloses se ocultan.`,
    ),
    el('p', '', `En el periodo: ${model.baseBasic} dispositivos como mucho en una semana; ${model.baseFull} comparten el detalle.`),
  )
  return foot
}

function login(message) {
  hideTip()
  app.replaceChildren()
  const head = el('header', 'masthead')
  head.append(el('span', 'kicker', 'Tasks · Panel'), el('h1', '', 'Cómo se usa Tasks'))
  const form = el('form', 'login')
  const input = el('input')
  input.type = 'password'
  input.placeholder = 'La clave del buzón'
  input.autocomplete = 'current-password'
  input.setAttribute('aria-label', 'Clave')
  const enter = el('button', 'primary', 'Entrar')
  form.append(input, enter)
  form.addEventListener('submit', (event) => {
    event.preventDefault()
    const key = input.value.trim()
    if (!key) return
    saveKey(key)
    void load()
  })
  app.append(head, form)
  if (message) app.append(el('p', 'error', message))
  input.focus()
}

async function load() {
  if (!hasKey()) return login()
  const preset = PRESETS.find((p) => p.id === state.preset) ?? PRESETS[1]
  const range = rangeFor(preset.days, localDay())
  app.classList.add('is-stale')
  let data
  try {
    data = await fetchSummary({ ...range, version: state.version })
  } catch (error) {
    app.classList.remove('is-stale')
    if (error instanceof AuthError) return login(error.message)
    if (!app.childElementCount) app.append(el('p', 'error', error.message))
    else app.prepend(el('p', 'error', error.message))
    return
  }
  const versions = new Set([...data.daily.map((row) => row[2]), ...data.screens.map((row) => row[0])].filter(Boolean))
  state.versions = [...versions].sort((a, b) => b.localeCompare(a, 'es', { numeric: true }))
  const model = shape(data, range, state.version)
  hideTip()
  app.replaceChildren(
    masthead(),
    filters(),
    audience(model),
    returning(model),
    frequency(model),
    features(model),
    heatSection(model, { range, version: state.version }),
    screens(model, screenLabel),
    performance(model),
    devices(model),
    footer(model),
  )
  app.classList.remove('is-stale')
}

document.addEventListener('scroll', hideTip, { passive: true })
void load()
