// V. Dónde se toca: elegir pantalla, ver su mapa de calor y la lista de lo que más se toca.

import { fetchHeat } from './api.js'
import { el, fmt, hbars, tableView } from './charts.js'
import { heatPhone, targetRows } from './heat.js'
import { screenLabel, targetLabel } from './labels.js'
import { K } from './model.js'
import { section } from './sections.js'

const state = { screen: null, mode: 'taps' }

/** Las capturas de referencia (`scripts/heat-shots.mjs`) se llaman como la pantalla. */
const shotOf = (screen) => `shots/${screen.replace(/[^a-z0-9-]/g, '_')}.webp`

export function heatSection(model, { range, version }) {
  const node = section('V', 'Dónde se toca', 'Los toques de quien comparte el detalle, sobre la pantalla. Rabia: tres toques seguidos en el mismo sitio. Sin efecto: tocar y que no cambie nada.')
  if (model.baseFull < K) {
    const quiet = el('div', 'card')
    quiet.append(el('p', 'quiet', `Hacen falta al menos ${K} dispositivos que compartan el detalle para enseñar el mapa de calor.`))
    node.append(quiet)
    return node
  }
  const totals = new Map()
  for (const [v, screen, taps] of model.screens) {
    if (version && v !== version) continue
    totals.set(screen, (totals.get(screen) ?? 0) + taps)
  }
  const screens = [...totals.entries()].sort((a, b) => b[1] - a[1])
  if (!screens.length) {
    const quiet = el('div', 'card')
    quiet.append(el('p', 'quiet', 'Aún no hay toques en este periodo.'))
    node.append(quiet)
    return node
  }
  if (!state.screen || !totals.has(state.screen)) state.screen = screens[0][0]

  const picker = el('div', 'screens')
  picker.setAttribute('role', 'tablist')
  const body = el('div', 'heat-body')
  const render = async () => {
    for (const button of picker.children) button.setAttribute('aria-selected', String(button.dataset.screen === state.screen))
    body.classList.add('is-stale')
    try {
      const data = await fetchHeat({ ...range, version, screen: state.screen })
      const phone = heatPhone(data.cells, {
        shot: shotOf(state.screen),
        mode: state.mode,
        onMode: (mode) => {
          state.mode = mode
          void render()
        },
      })
      const rows = targetRows(data.targets, targetLabel)
      const list = el('div', 'card')
      list.append(
        el('h3', 'subhead', 'Lo que más se toca'),
        hbars(rows, { empty: 'Nada tocado aquí en este periodo.' }),
        tableView(
          ['Elemento', 'Toques', 'Rabia', 'Sin efecto', 'Lentos'],
          data.targets.map(([target, taps, rage, dead, slow]) => [targetLabel(target), fmt(taps), fmt(rage), fmt(dead), fmt(slow)]),
        ),
      )
      const phoneCard = el('div', 'card card--phone')
      phoneCard.append(phone, el('p', 'quiet small', version ? `Versión ${version}.` : 'Todas las versiones: si la pantalla cambió entre ellas, los toques no casan del todo con la captura.'))
      body.replaceChildren(phoneCard, list)
    } catch (error) {
      body.replaceChildren(el('p', 'error', error.message))
    } finally {
      body.classList.remove('is-stale')
    }
  }
  for (const [screen, taps] of screens) {
    const button = el('button', 'chip', screenLabel(screen))
    button.type = 'button'
    button.dataset.screen = screen
    button.setAttribute('role', 'tab')
    button.title = `${fmt(taps)} toques`
    button.addEventListener('click', () => {
      state.screen = screen
      void render()
    })
    picker.append(button)
  }
  node.append(picker, body)
  void render()
  return node
}
