/**
 * Qué hay debajo de lo rodeado, leído del DOM: el texto de cada cosa y dónde está en la app (sus
 * clases), para que quien lea la sugerencia sepa de qué se habla aunque no haya captura.
 */
import type { ElementInfo, Region } from '../../lib/feedback'
import { samplePoints } from '../../lib/feedback'

/** Todo lo del modo sugerencia cuelga de esta clase: no cuenta como parte de la app. */
export const FEEDBACK_ROOT = 'fb'
const MAX_TEXT = 120
const LEVELS = 4

const isState = (name: string) => name.startsWith('is-') || name.startsWith('has-')

/** "agenda › tl-row › row__title": las clases de la cosa y de sus dos padres más cercanos. */
function classPath(node: Element): string {
  const parts: string[] = []
  let current: Element | null = node
  while (current && current !== document.body && parts.length < 3) {
    const classes = [...current.classList].filter((name) => !isState(name)).slice(0, 2)
    if (classes.length) parts.unshift(classes.join('.'))
    current = current.parentElement
  }
  return parts.join(' › ')
}

/** El texto que se lee en esa cosa (o su `aria-label`, si es un icono). Un contenedor entero, no. */
function labelOf(node: Element): string {
  let current: Element | null = node
  for (let depth = 0; current && depth < LEVELS; depth++, current = current.parentElement) {
    const label = current.getAttribute('aria-label')
    if (label) return label
    const text = current instanceof HTMLElement ? current.innerText.trim() : ''
    if (text) return text.length <= MAX_TEXT ? text : ''
  }
  return ''
}

export function elementsIn(region: Region): ElementInfo[] {
  const seen = new Set<Element>()
  const found: ElementInfo[] = []
  // Desde el centro hacia fuera: lo que se rodea está en medio; en los bordes asoma lo de al lado.
  const cx = region.x + region.width / 2
  const cy = region.y + region.height / 2
  const points = samplePoints(region).sort((a, b) => Math.hypot(a.x - cx, a.y - cy) - Math.hypot(b.x - cx, b.y - cy))
  for (const point of points) {
    const top = document.elementsFromPoint(point.x, point.y).find((node) => !node.closest(`.${FEEDBACK_ROOT}`))
    if (!top || seen.has(top) || top === document.documentElement || top === document.body) continue
    seen.add(top)
    found.push({ label: labelOf(top), path: classPath(top) })
  }
  // Primero lo que tiene texto: es lo que se lee.
  return [...found.filter((info) => info.label), ...found.filter((info) => !info.label)]
}

/** El panel de la app que estaba abierto (el de más arriba), por su título. */
export function openSheetTitle(): string | null {
  const sheets = [...document.querySelectorAll(`.sheet.is-open:not(.${FEEDBACK_ROOT}-sheet)`)]
  return sheets[sheets.length - 1]?.getAttribute('aria-label') ?? null
}
