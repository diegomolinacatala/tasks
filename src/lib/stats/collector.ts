import { startOfWeek, todayIso } from '../date'
import type { IsoDate, StatsLevel, Theme } from '../../types'
import { attach, type StatsSignal } from './bus'
import { bootBucket, hourBucket, latencyBucket, sessionBucket, SLOW_MS } from './buckets'
import { errorSignature } from './errors'
import { emptyLedger, fullFor, parseLedger, sizeOf, usageFor, type Ledger } from './ledger'
import {
  addDist,
  addError,
  addEvent,
  addTap,
  basicOnly,
  emptyPending,
  isBasicEvent,
  isEmpty,
  markDead,
  mergePending,
  setFull,
  setUsage,
  toBatch,
  type Pending,
  type Reached,
  type StatsPlatform,
} from './pending'
import { SCREEN, cellOf, rageAfter, targetOf, type Tap } from './taps'

/**
 * El recolector (en su propio trozo): escucha lo que pasa en la app, lo suma en local y lo manda de vez
 * en cuando. Ningún identificador sale de aquí; ver "Estadísticas" en CLAUDE.md.
 */

export interface CollectorConfig {
  level: Exclude<StatsLevel, 'off'>
  apiBase: string
  version: string
  platform: StatsPlatform
  cohort: IsoDate | null
  lang: 'es' | 'en'
  theme: Theme
  /** En modo sugerencia: los toques no cuentan (se está señalando, no usando la app). */
  paused: boolean
  /** La semana del primer envío: se guarda en los ajustes (el fichero de estado aguanta más que localStorage). */
  onCohort: (cohort: IsoDate) => void
}

const STORAGE = 'tasks:stats'
/** Se manda al pasar a segundo plano si pasó este rato desde lo último (o si hay días ya cerrados). */
const FLUSH_EVERY_MS = 15 * 60 * 1000
/** `keepalive` solo admite cuerpos pequeños (64 KB entre todas las peticiones pendientes). */
const KEEPALIVE_CHARS = 55_000
const SEND_TIMEOUT_MS = 15_000
const SAVE_DELAY_MS = 2000
/** Lo que se espera a ver si un toque cambió algo (para "sin efecto"). */
const DEAD_MS = 500
/** Más que esto no es la app respondiendo lenta: es que no había fotogramas (bloqueo, segundo plano). */
const MAX_LATENCY_MS = 5000
/** Más movimiento o más rato entre apoyar y soltar ya no es un toque: es deslizar o mantener. */
const TAP_MOVE_PX = 10
const TAP_MAX_MS = 700
/** Un `<label>` con su `<input>` dan dos clics por un toque. */
const TWIN_CLICK_MS = 60
const INTERACTIVE = 'button, a, input, select, textarea, label, summary, [role="button"], [role="tab"], [role="switch"], [role="checkbox"], [role="option"], [tabindex]'
/** Lo que delata que un toque hizo algo: estados y estructura, no el texto ni cada fotograma de una animación. */
const CHANGES: MutationObserverInit = {
  subtree: true,
  childList: true,
  attributes: true,
  attributeFilter: ['class', 'hidden', 'open', 'inert', 'aria-expanded', 'aria-hidden', 'aria-checked', 'aria-pressed', 'aria-selected', 'data-screen'],
}

interface Saved {
  ledger: Ledger
  pending: Pending | null
  /** Lo que quedó sin mandar de otra versión (antes de actualizar): se manda con la suya. */
  leftover: Pending | null
  reached: Reached
  lastFlush: number
}

const isPending = (value: unknown): value is Pending =>
  typeof value === 'object' && value !== null && 'days' in value && 'weeks' in value && typeof (value as Pending).version === 'string'

function cleanReached(raw: unknown): Reached {
  if (typeof raw !== 'object' || raw === null) return {}
  return Object.fromEntries(
    Object.entries(raw)
      .filter(([day, names]) => /^\d{4}-\d{2}-\d{2}$/.test(day) && Array.isArray(names))
      .map(([day, names]) => [day, (names as unknown[]).filter((name): name is string => typeof name === 'string')]),
  )
}

function readSaved(today: IsoDate): Saved {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE) ?? 'null') as Record<string, unknown> | null
    if (!raw || typeof raw !== 'object') throw new Error('vacío')
    return {
      ledger: parseLedger(raw.ledger, today),
      pending: isPending(raw.pending) ? raw.pending : null,
      leftover: isPending(raw.leftover) && !isEmpty(raw.leftover) ? raw.leftover : null,
      reached: cleanReached(raw.reached),
      lastFlush: typeof raw.lastFlush === 'number' ? raw.lastFlush : 0,
    }
  } catch {
    return { ledger: emptyLedger(), pending: null, leftover: null, reached: {}, lastFlush: 0 }
  }
}

/** Con las estadísticas apagadas no queda nada de ellas en el dispositivo. */
export function forgetStats(): void {
  try {
    localStorage.removeItem(STORAGE)
  } catch {
    // Nada que borrar.
  }
}

export interface Collector {
  update(config: CollectorConfig): void
  stop(): void
}

interface Open {
  week: IsoDate
  screen: string
  cell: number
  target: string | null
  rage: boolean
  changed: boolean
  latency: number | null
}

export function startCollector(initial: CollectorConfig): Collector {
  let config = initial
  let today = todayIso()
  const saved = readSaved(today)
  const own = (p: Pending | null): p is Pending => p !== null && p.version === config.version && p.platform === config.platform
  let ledger = saved.ledger
  let reached = saved.reached
  let lastFlush = saved.lastFlush
  let pending: Pending = own(saved.pending) ? saved.pending : emptyPending(config.version, config.platform)
  let leftover: Pending | null =
    saved.leftover ?? (saved.pending && !own(saved.pending) && !isEmpty(saved.pending) ? saved.pending : null)
  let sending = false
  let stopped = false
  let saveTimer = 0
  let sessionStart: number | null = document.visibilityState === 'visible' ? Date.now() : null
  let recent: Tap[] = []
  let lastClick = 0
  let down: { x: number; y: number; at: number } | null = null
  const cleanups: (() => void)[] = []
  // Todo lo que queda en marcha (temporizadores, fotogramas): al parar, se cancela, y nada escribe después.
  const timers = new Set<number>()
  const frames = new Set<number>()
  const later = (run: () => void, ms: number) => {
    const id = window.setTimeout(() => {
      timers.delete(id)
      if (!stopped) run()
    }, ms)
    timers.add(id)
    return id
  }
  const nextFrame = (run: () => void) => {
    const id = requestAnimationFrame(() => {
      frames.delete(id)
      if (!stopped) run()
    })
    frames.add(id)
  }

  const full = () => config.level === 'full'

  // Lo alcanzado solo importa en los días que aún tienen algo por mandar (y hoy).
  const pruneReached = () => {
    const keep = new Set([todayIso(), ...Object.keys(pending.days), ...Object.keys(leftover?.days ?? {})])
    reached = Object.fromEntries(Object.entries(reached).filter(([day]) => keep.has(day)))
  }

  const save = () => {
    window.clearTimeout(saveTimer)
    timers.delete(saveTimer)
    saveTimer = 0
    if (stopped) return
    pruneReached()
    try {
      const value: Saved = { ledger, pending, leftover, reached, lastFlush }
      localStorage.setItem(STORAGE, JSON.stringify(value))
    } catch {
      // Sin almacenamiento, lo contado vive hasta que se mande.
    }
  }
  const saveSoon = () => {
    if (!saveTimer) saveTimer = later(save, SAVE_DELAY_MS)
  }
  const change = (next: Pending) => {
    if (stopped) return
    pending = next
    saveSoon()
  }

  /** Quien comparte el detalle cuenta una vez al día como tal (también si lo activa a media jornada). */
  const markFull = () => {
    if (!full()) return
    const marked = fullFor(ledger, todayIso())
    if (!marked) return
    ledger = marked.ledger
    change(setFull(pending, todayIso(), marked.weekly))
  }

  /** El día cambia con la app abierta (o al volver): el ping del día nuevo. */
  const ping = () => {
    today = todayIso()
    const result = usageFor(ledger, today, { cohort: config.cohort, lang: config.lang, theme: config.theme, size: sizeOf(window.innerHeight) })
    ledger = result.ledger
    if (result.usage) {
      if (result.usage.first) config.onCohort(result.usage.cohort)
      change(setUsage(pending, today, result.usage))
    }
    markFull()
  }

  const event = (name: string, n = 1) => {
    if (!full() && !isBasicEvent(name)) return
    change(addEvent(pending, todayIso(), name, n))
  }

  const onSignal = (signal: StatsSignal) => {
    // Pasada la medianoche con la app delante, el ping del día nuevo sale con lo primero que pase.
    if (todayIso() !== today) ping()
    if (signal.kind === 'event') event(signal.name, signal.n)
    else change(addDist(pending, todayIso(), 'boot', bootBucket(signal.ms)))
  }

  // ── Envío ──
  async function post(body: string, keepalive: boolean): Promise<boolean> {
    const controller = new AbortController()
    const timer = window.setTimeout(() => controller.abort(), SEND_TIMEOUT_MS)
    try {
      const response = await fetch(`${config.apiBase}/v1/stats`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body,
        keepalive,
        credentials: 'omit',
        signal: controller.signal,
      })
      // Un 4xx (salvo 429) no se arregla insistiendo: ese lote se pierde, no se reintenta para siempre.
      return response.ok || (response.status >= 400 && response.status < 500 && response.status !== 429)
    } catch {
      return false
    } finally {
      window.clearTimeout(timer)
    }
  }

  async function flush(keepalive: boolean) {
    if (sending || stopped) return
    const fromLeftover = leftover !== null
    const snapshot = leftover ?? pending
    if (isEmpty(snapshot)) return
    let body: string
    let nextReached: Record<IsoDate, string[]>
    try {
      const built = toBatch(snapshot, reached)
      body = JSON.stringify(built.batch)
      nextReached = built.reached
    } catch {
      return
    }
    if (keepalive && body.length > KEEPALIVE_CHARS) return
    sending = true
    const before = { reached, lastFlush }
    // Se da por enviado antes de mandarlo: si iOS suspende la app a mitad, al volver no se manda otra vez
    // (perder un lote es mejor que contar dos veces a alguien).
    if (fromLeftover) leftover = null
    else pending = emptyPending(config.version, config.platform)
    reached = { ...reached, ...nextReached }
    lastFlush = Date.now()
    save()
    const ok = await post(body, keepalive)
    sending = false
    if (stopped || ok) return save()
    // No llegó: vuelve a sumarse a lo nuevo, con lo alcanzado de antes.
    reached = before.reached
    lastFlush = before.lastFlush
    if (fromLeftover) leftover = leftover ? mergePending(snapshot, leftover) : snapshot
    else pending = mergePending(snapshot, pending)
    save()
  }

  const closedDays = (p: Pending) =>
    Object.keys(p.days).some((day) => day < todayIso()) || Object.keys(p.weeks).some((week) => week < startOfWeek(todayIso()))

  // ── Visitas ──
  const endSession = () => {
    if (sessionStart === null) return
    const seconds = Math.round((Date.now() - sessionStart) / 1000)
    const started = new Date(sessionStart)
    sessionStart = null
    if (seconds < 1) return
    let next = addEvent(pending, todayIso(), 'sessions')
    next = addEvent(next, todayIso(), 'seconds', Math.min(seconds, 6 * 3600))
    next = addDist(next, todayIso(), 'sess', sessionBucket(seconds))
    change(addDist(next, todayIso(), 'hour', hourBucket(started)))
  }

  const onVisibility = () => {
    if (document.visibilityState === 'hidden') {
      settleTaps()
      endSession()
      save()
      if (closedDays(pending) || leftover || Date.now() - lastFlush >= FLUSH_EVERY_MS) void flush(true)
      return
    }
    sessionStart = Date.now()
    ping()
    if (closedDays(pending) || leftover) void flush(false)
  }
  document.addEventListener('visibilitychange', onVisibility)
  cleanups.push(() => document.removeEventListener('visibilitychange', onVisibility))
  const onPageHide = () => {
    settleTaps()
    endSession()
    save()
  }
  window.addEventListener('pagehide', onPageHide)
  cleanups.push(() => window.removeEventListener('pagehide', onPageHide))

  // ── Errores (sin el mensaje) ──
  const onError = (event: ErrorEvent) => change(addError(pending, todayIso(), errorSignature(event.error ?? new Error())))
  const onRejection = (event: PromiseRejectionEvent) => change(addError(pending, todayIso(), errorSignature(event.reason)))
  window.addEventListener('error', onError)
  window.addEventListener('unhandledrejection', onRejection)
  cleanups.push(() => {
    window.removeEventListener('error', onError)
    window.removeEventListener('unhandledrejection', onRejection)
  })

  // ── Toques (solo con el detalle) ──
  // Un solo observador para todos los toques abiertos, y solo mientras hay alguno.
  const open = new Map<Open, number>()
  let observer: MutationObserver | null = null
  const touched = () => {
    for (const tap of open.keys()) tap.changed = true
  }
  const watch = () => {
    if (observer) return
    observer = new MutationObserver(touched)
    observer.observe(document.body, CHANGES)
    // El scroll de la app va dentro de sus listas (`.app__scroll`): se oye en captura.
    document.addEventListener('scroll', touched, { capture: true, passive: true })
  }
  const unwatch = () => {
    if (!observer || open.size) return
    observer.disconnect()
    observer = null
    document.removeEventListener('scroll', touched, { capture: true })
  }

  const settle = (tap: Open) => {
    const timer = open.get(tap)
    if (timer === undefined) return
    open.delete(tap)
    window.clearTimeout(timer)
    timers.delete(timer)
    unwatch()
    if (stopped) return
    const slow = tap.latency !== null && tap.latency > SLOW_MS
    change(addTap(pending, tap.week, tap.screen, tap.cell, tap.target, { rage: tap.rage, dead: false, slow }))
    if (!tap.changed) change(markDead(pending, tap.week, tap.screen, tap.cell, tap.target))
  }
  function settleTaps() {
    for (const tap of [...open.keys()]) settle(tap)
  }

  const onPointerDown = (event: PointerEvent) => {
    down = { x: event.clientX, y: event.clientY, at: event.timeStamp }
  }

  const onClick = (event: MouseEvent) => {
    if (!full() || config.paused || !event.isTrusted || event.detail === 0) return
    const start = down
    down = null
    if (!start || Math.hypot(event.clientX - start.x, event.clientY - start.y) > TAP_MOVE_PX) return
    if (event.timeStamp - start.at > TAP_MAX_MS || event.timeStamp - lastClick < TWIN_CLICK_MS) return
    lastClick = event.timeStamp
    const element = event.target instanceof Element ? event.target : null
    if (!element || element.closest('.fb')) return
    const screen = element.closest('[data-screen]')?.getAttribute('data-screen') ?? null
    if (!screen || !SCREEN.test(screen)) return
    const cell = cellOf(event.clientX, event.clientY, window.innerWidth, window.innerHeight)
    if (cell === null) return
    const host = element.closest(INTERACTIVE) ?? element
    let target: string | null = null
    for (let node: Element | null = host, depth = 0; node && depth < 4 && !target; node = node.parentElement, depth++) {
      target = targetOf([...node.classList])
    }
    const rage = rageAfter(recent, { x: event.clientX, y: event.clientY, at: event.timeStamp })
    recent = rage.recent
    const tap: Open = {
      week: startOfWeek(todayIso()),
      screen,
      cell,
      target,
      rage: rage.rage,
      // Un campo o un selector nativo (la rueda de la hora) responde fuera del DOM: nunca es "sin efecto".
      changed: host.matches('input, select, textarea, label'),
      latency: null,
    }
    watch()
    open.set(tap, later(() => settle(tap), DEAD_MS))
    const t0 = event.timeStamp
    nextFrame(() =>
      later(() => {
        const ms = performance.now() - t0
        // En segundo plano no hay fotogramas: lo medido no diría nada de la app.
        if (document.visibilityState !== 'visible' || ms > MAX_LATENCY_MS || !full()) return
        tap.latency = ms
        change(addDist(pending, todayIso(), 'lat', latencyBucket(ms)))
      }, 0),
    )
  }

  let listening = false
  const listenTaps = () => {
    if (listening) return
    listening = true
    window.addEventListener('pointerdown', onPointerDown, { capture: true, passive: true })
    window.addEventListener('click', onClick, { capture: true, passive: true })
  }
  const unlistenTaps = () => {
    if (!listening) return
    listening = false
    window.removeEventListener('pointerdown', onPointerDown, { capture: true })
    window.removeEventListener('click', onClick, { capture: true })
    settleTaps()
  }
  if (full()) listenTaps()
  cleanups.push(unlistenTaps)

  cleanups.push(attach(onSignal))

  ping()
  if (closedDays(pending) || leftover) void flush(false)

  return {
    update(next) {
      const wasFull = full()
      config = next
      if (wasFull && !full()) {
        unlistenTaps()
        // Quien retira el detalle no manda lo que ya estaba contado de él. Si su marca de hoy aún no
        // salió, se olvida también, para que vuelva a contar si lo activa otra vez hoy.
        if (pending.days[todayIso()]?.full) ledger = { ...ledger, fullDay: null }
        pending = basicOnly(pending)
        leftover = leftover ? basicOnly(leftover) : null
        save()
      } else if (!wasFull && full()) {
        listenTaps()
        markFull()
      }
    },
    stop() {
      for (const cleanup of cleanups.splice(0)) cleanup()
      endSession()
      save()
      stopped = true
      for (const id of timers) window.clearTimeout(id)
      for (const id of frames) cancelAnimationFrame(id)
      timers.clear()
      frames.clear()
      open.clear()
      unwatch()
    },
  }
}
