import { flushSync } from 'react-dom'
import type { Theme } from '../types'
import { isNative } from './platform'

/**
 * Apariencia: clara (papel marfil), oscura (noche de biblioteca) o la del sistema. La elección vive
 * en el estado, pero se copia en `localStorage`: el script de arranque de `index.html` la lee antes
 * de pintar nada, así que la app no parpadea en claro antes de pasar a oscuro.
 */

export type ResolvedTheme = 'light' | 'dark'

/** La misma clave que lee el script de `index.html`. */
export const THEME_KEY = 'tasks:theme'
const DARK_QUERY = '(prefers-color-scheme: dark)'
/** `--bg` de cada tema: la barra del navegador y el fondo de la PWA. */
const PAPER: Record<ResolvedTheme, string> = { light: '#f4efe6', dark: '#121828' }

export const resolveTheme = (theme: Theme, systemDark: boolean): ResolvedTheme =>
  theme === 'auto' ? (systemDark ? 'dark' : 'light') : theme

const systemDark = () => typeof window !== 'undefined' && window.matchMedia(DARK_QUERY).matches

export const currentTheme = (): ResolvedTheme => (document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light')

function paint(resolved: ResolvedTheme): void {
  const root = document.documentElement
  if (resolved === 'dark') root.dataset.theme = 'dark'
  else delete root.dataset.theme
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', PAPER[resolved])
}

function remember(theme: Theme): void {
  try {
    localStorage.setItem(THEME_KEY, theme)
  } catch {
    // Sin almacenamiento el arranque sigue al sistema: como mucho, un parpadeo.
  }
}

/** La barra de estado, los selectores y el teclado del iPhone, con el mismo tema que la web. */
function syncNative(theme: Theme, resolved: ResolvedTheme): void {
  if (!isNative) return
  void import('./platform/appearance').then(({ syncAppearance }) => syncAppearance(theme, resolved)).catch(() => undefined)
}

/** Aplica la apariencia y, si sigue al sistema, la mantiene al día. Devuelve cómo dejar de escuchar. */
export function applyTheme(theme: Theme): () => void {
  remember(theme)
  const media = window.matchMedia(DARK_QUERY)
  const update = () => {
    const resolved = resolveTheme(theme, media.matches)
    paint(resolved)
    syncNative(theme, resolved)
  }
  update()
  if (theme !== 'auto') return () => undefined
  media.addEventListener('change', update)
  return () => media.removeEventListener('change', update)
}

type ViewTransitionDocument = Document & {
  startViewTransition?: (callback: () => void) => { ready: Promise<void>; finished: Promise<void> }
}

/**
 * Cambia de apariencia con un círculo que crece desde donde se ha tocado, como tinta que se
 * extiende. Sin View Transitions (o con movimiento reducido), cambia sin más.
 */
export function switchTheme(theme: Theme, commit: () => void, origin?: { x: number; y: number }): void {
  const doc = document as ViewTransitionDocument
  const next = resolveTheme(theme, systemDark())
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  if (!doc.startViewTransition || reduced || next === currentTheme()) {
    commit()
    return
  }
  const x = origin?.x ?? window.innerWidth / 2
  const y = origin?.y ?? window.innerHeight / 2
  const radius = Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y))
  // Sin el fundido de siempre (base.css): el tema viejo se queda quieto debajo mientras crece el nuevo.
  const root = document.documentElement
  root.classList.add('theme-switching')
  const transition = doc.startViewTransition(() => {
    paint(next)
    flushSync(commit)
  })
  // `finished` también rechaza si se salta la transición: la clase se quita igual.
  transition.finished.catch(() => undefined).finally(() => root.classList.remove('theme-switching'))
  transition.ready
    .then(() =>
      document.documentElement.animate(
        { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${radius}px at ${x}px ${y}px)`] },
        { duration: 520, easing: 'cubic-bezier(0.32, 0.72, 0, 1)', pseudoElement: '::view-transition-new(root)' },
      ),
    )
    .catch(() => undefined)
}
