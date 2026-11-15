import { describe, expect, it } from 'vitest'
import { Clock, canonical, isLive, merge, parseStamped, stampLocal, valueOf } from './stamp'

describe('canonical', () => {
  it('da el mismo texto con las claves en otro orden', () => {
    expect(canonical({ b: 1, a: [1, { d: 2, c: 3 }] })).toBe(canonical({ a: [1, { c: 3, d: 2 }], b: 1 }))
  })

  it('ignora lo indefinido dentro de un objeto', () => {
    expect(canonical({ a: 1, b: undefined })).toBe(canonical({ a: 1 }))
  })
})

describe('stampLocal', () => {
  it('sella solo los campos que cambian', () => {
    const first = stampLocal(undefined, 't:1', { title: 'Pan', done: false }, 10)!
    const second = stampLocal(first, 't:1', { title: 'Pan', done: true }, 20)!
    expect(second.f.title).toEqual(['Pan', 10])
    expect(second.f.done).toEqual([true, 20])
  })

  it('devuelve el mismo objeto si no cambia nada', () => {
    const first = stampLocal(undefined, 't:1', { title: 'Pan' }, 10)!
    expect(stampLocal(first, 't:1', { title: 'Pan' }, 20)).toBe(first)
  })

  it('borrar deja una lápida con lo que se veía y conserva los campos', () => {
    const first = stampLocal(undefined, 't:1', { title: 'Pan' }, 10)!
    const gone = stampLocal(first, 't:1', null, 30)!
    expect(gone.x).toEqual({ t: 30, seen: 10 })
    expect(gone.f.title).toEqual(['Pan', 10])
    expect(isLive(gone)).toBe(false)
    expect(valueOf(gone)).toBeNull()
  })

  it('volver a crearlo tras borrarlo lo revive entero', () => {
    const gone = stampLocal(stampLocal(undefined, 't:1', { title: 'Pan' }, 10), 't:1', null, 30)!
    const back = stampLocal(gone, 't:1', { title: 'Pan' }, 40)!
    expect(isLive(back)).toBe(true)
    expect(valueOf(back)).toEqual({ title: 'Pan' })
  })

  it('un campo que desaparece queda en nulo', () => {
    const first = stampLocal(undefined, 'g', { a: 1, b: 2 }, 10)!
    expect(stampLocal(first, 'g', { a: 1 }, 20)!.f.b).toEqual([null, 20])
  })
})

describe('merge', () => {
  it('se queda campo a campo con lo más reciente', () => {
    const base = stampLocal(undefined, 't:1', { title: 'Pan', done: false }, 10)!
    const phone = stampLocal(base, 't:1', { title: 'Pan', done: true }, 20)!
    const pc = stampLocal(base, 't:1', { title: 'Pan integral', done: false }, 25)!
    const merged = merge(phone, pc)
    expect(valueOf(merged)).toEqual({ title: 'Pan integral', done: true })
    expect(merge(pc, phone)).toEqual(merged)
  })

  it('una edición que quien borró no había visto gana al borrado', () => {
    const base = stampLocal(undefined, 't:1', { title: 'Pan' }, 10)!
    const deleted = stampLocal(base, 't:1', null, 30)!
    const edited = stampLocal(base, 't:1', { title: 'Pan integral' }, 20)!
    expect(valueOf(merge(deleted, edited))).toEqual({ title: 'Pan integral' })
    expect(valueOf(merge(edited, deleted))).toEqual({ title: 'Pan integral' })
  })

  it('el borrado gana a lo que ya había visto', () => {
    const edited = stampLocal(stampLocal(undefined, 't:1', { title: 'Pan' }, 10), 't:1', { title: 'Pan integral' }, 20)!
    const deleted = stampLocal(edited, 't:1', null, 30)!
    expect(valueOf(merge(edited, deleted))).toBeNull()
  })

  it('dos lápidas a la misma hora: los dos lados eligen la misma', () => {
    const a = { key: 'k', f: { v: ['a', 5] as [unknown, number] }, x: { t: 10, seen: 5 } }
    const b = { key: 'k', f: { v: ['a', 5] as [unknown, number] }, x: { t: 10, seen: 3 } }
    expect(merge(a, b)).toEqual(merge(b, a))
  })

  it('con la misma hora los dos lados eligen lo mismo', () => {
    const a = stampLocal(undefined, 'k', { v: 'a' }, 10)!
    const b = stampLocal(undefined, 'k', { v: 'b' }, 10)!
    expect(merge(a, b)).toEqual(merge(b, a))
  })
})

describe('parseStamped', () => {
  it('acepta un registro bien formado', () => {
    const stamped = stampLocal(undefined, 't:1', { title: 'Pan' }, 10)!
    expect(parseStamped(JSON.parse(JSON.stringify(stamped)))).toEqual(stamped)
  })

  it('rechaza horas imposibles: pararían el reloj de todos', () => {
    const now = 1_000_000
    expect(parseStamped({ key: 'k', f: { a: [1, 1e308] } }, now)).toBeNull()
    expect(parseStamped({ key: 'k', f: { a: [1, now + 2 * 86_400_000] } }, now)).toBeNull()
    expect(parseStamped({ key: 'k', f: {}, x: { t: Number.NaN, seen: 1 } }, now)).toBeNull()
    expect(parseStamped({ key: 'k', f: { a: [1, now + 3_600_000] } }, now)).not.toBeNull()
  })

  it('rechaza lo mal formado', () => {
    expect(parseStamped(null)).toBeNull()
    expect(parseStamped({ key: 't:1', f: { a: [1] } })).toBeNull()
    expect(parseStamped({ key: 't:1', f: {}, x: { t: 'x' } })).toBeNull()
  })
})

describe('Clock', () => {
  it('nunca va hacia atrás y escribe por delante de lo visto', () => {
    let now = 100
    const clock = new Clock(0, () => now)
    expect(clock.tick()).toBe(100)
    expect(clock.tick()).toBe(101)
    clock.observe(500)
    expect(clock.tick()).toBe(501)
    now = 50
    expect(clock.tick()).toBe(502)
    clock.observe(1e308)
    expect(clock.tick()).toBe(503)
  })
})
