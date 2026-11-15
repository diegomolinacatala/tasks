import type { Fields } from './records'

/**
 * Un registro sellado: cada campo con la hora (`t`) en que se escribió y, si se borró, su lápida. Mezclar dos
 * es quedarse, campo a campo, con lo más reciente; así dos dispositivos que tocan cosas distintas de la misma
 * tarea conservan los dos cambios. Ver `docs/sincronizacion.md`.
 */
export interface Stamped {
  key: string
  f: Record<string, [unknown, number]>
  /** Lápida: cuándo se borró y la hora más reciente de los campos que se veían al borrarlo. */
  x?: { t: number; seen: number }
}

/** JSON con las claves ordenadas: dos valores iguales dan siempre el mismo texto. */
export function canonical(value: unknown): string {
  if (value === undefined) return 'null'
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(',')}}`
  }
  return JSON.stringify(value)
}

export const sameValue = (a: unknown, b: unknown): boolean => a === b || canonical(a) === canonical(b)

export function sameFields(a: Fields | null | undefined, b: Fields | null | undefined): boolean {
  if (a === b) return true
  if (!a || !b) return false
  return canonical(a) === canonical(b)
}

export const maxT = (stamped: Stamped): number => Object.values(stamped.f).reduce((max, [, t]) => Math.max(max, t), 0)

/** Vive si no se borró o si algo se escribió después de lo que vio quien lo borró: la edición gana. */
export const isLive = (stamped: Stamped): boolean => !stamped.x || maxT(stamped) > stamped.x.seen

export function valueOf(stamped: Stamped | undefined): Fields | null {
  if (!stamped || !isLive(stamped)) return null
  const out: Record<string, unknown> = {}
  for (const [field, [value]] of Object.entries(stamped.f)) if (value !== undefined) out[field] = value
  return out
}

/**
 * Sella un cambio hecho aquí: solo los campos que cambian llevan la hora `t`. `next` nulo es borrarlo (los
 * campos se conservan: una edición que no se vio puede devolverlo). Si no cambia nada, el mismo objeto.
 */
export function stampLocal(prev: Stamped | undefined, key: string, next: Fields | null, t: number): Stamped | undefined {
  if (next === null) {
    if (!prev || !isLive(prev)) return prev
    return { ...prev, x: { t, seen: maxT(prev) } }
  }
  const revived = prev !== undefined && !isLive(prev)
  const f: Record<string, [unknown, number]> = {}
  let changed = prev === undefined || revived
  for (const [field, value] of Object.entries(next)) {
    const old = prev?.f[field]
    if (old && !revived && sameValue(old[0], value)) f[field] = old
    else {
      f[field] = [value, t]
      changed = true
    }
  }
  for (const field of Object.keys(prev?.f ?? {})) {
    if (field in f) continue
    const old = prev!.f[field]!
    if (old[0] === null) f[field] = old
    else {
      f[field] = [null, t]
      changed = true
    }
  }
  if (!changed) return prev
  return prev?.x ? { key, f, x: prev.x } : { key, f }
}

/** Gana el campo con la hora mayor; empate, el valor mayor como texto (los dos lados eligen lo mismo). */
function newer(a: [unknown, number] | undefined, b: [unknown, number] | undefined): [unknown, number] | undefined {
  if (!a) return b
  if (!b) return a
  if (a[1] !== b[1]) return a[1] > b[1] ? a : b
  return canonical(a[0]) >= canonical(b[0]) ? a : b
}

function newerTomb(a: { t: number; seen: number }, b: { t: number; seen: number }) {
  if (a.t !== b.t) return a.t > b.t ? a : b
  return a.seen >= b.seen ? a : b
}

/**
 * Lo más lejos en el futuro que se acepta una hora de otro dispositivo: un reloj adelantado unas horas sí, una
 * hora absurda (que ganaría para siempre y pararía el reloj de todos) no.
 */
export const MAX_SKEW_MS = 24 * 60 * 60 * 1000

const isPlausible = (t: unknown, limit: number): t is number => typeof t === 'number' && Number.isFinite(t) && t >= 0 && t <= limit

export function merge(local: Stamped | undefined, remote: Stamped): Stamped {
  if (!local) return remote
  const f: Record<string, [unknown, number]> = {}
  for (const field of new Set([...Object.keys(local.f), ...Object.keys(remote.f)])) {
    f[field] = newer(local.f[field], remote.f[field])!
  }
  // Dos lápidas a la misma hora: la que vio más (los dos lados eligen la misma).
  const x = !local.x ? remote.x : !remote.x ? local.x : newerTomb(local.x, remote.x)
  return x ? { key: local.key, f, x } : { key: local.key, f }
}

export const sameStamped = (a: Stamped | undefined, b: Stamped | undefined): boolean =>
  a === b || (a !== undefined && b !== undefined && canonical(a) === canonical(b))

/** Si `value` es un registro sellado bien formado (lo que llega descifrado de la sala). */
export function parseStamped(value: unknown, now: number = Date.now()): Stamped | null {
  if (!value || typeof value !== 'object') return null
  const limit = now + MAX_SKEW_MS
  const raw = value as Record<string, unknown>
  if (typeof raw.key !== 'string' || !raw.key || !raw.f || typeof raw.f !== 'object') return null
  const f: Record<string, [unknown, number]> = {}
  for (const [field, pair] of Object.entries(raw.f as Record<string, unknown>)) {
    if (!Array.isArray(pair) || pair.length !== 2 || !isPlausible(pair[1], limit)) return null
    f[field] = [pair[0], pair[1]]
  }
  const x = raw.x as Record<string, unknown> | undefined
  if (x === undefined) return { key: raw.key, f }
  if (!x || !isPlausible(x.t, limit) || !isPlausible(x.seen, limit)) return null
  return { key: raw.key, f, x: { t: x.t, seen: x.seen } }
}

/** Reloj híbrido: nunca va hacia atrás y, tras ver una hora de otro dispositivo, escribe por delante de ella. */
export class Clock {
  private last: number

  constructor(last = 0, private readonly now: () => number = Date.now) {
    this.last = last
  }

  tick(): number {
    this.last = Math.max(this.now(), this.last + 1)
    return this.last
  }

  observe(t: number): void {
    if (Number.isFinite(t) && t > this.last && t <= this.now() + MAX_SKEW_MS) this.last = t
  }

  get value(): number {
    return this.last
  }
}
