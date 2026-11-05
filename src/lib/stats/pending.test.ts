import { describe, expect, test } from 'vitest'
import {
  LIMITS,
  MAX_BATCH_ROWS,
  addDist,
  addError,
  addEvent,
  addTap,
  basicOnly,
  emptyPending,
  isEmpty,
  markDead,
  mergePending,
  setFull,
  setUsage,
  toBatch,
  type Usage,
} from './pending'

const MON = '2026-11-02'
const TODAY = '2026-11-05'
const usage: Usage = {
  weekly: true,
  monthly: false,
  first: false,
  cohort: '2026-10-26',
  active28: 4,
  lang: 'es',
  theme: 'auto',
  size: 'm',
}
const quiet = { rage: false, dead: false, slow: false }

describe('lo contado y aún no enviado', () => {
  test('suma eventos, tramos, errores y toques sin tocar lo anterior', () => {
    const empty = emptyPending('1.9', 'ios')
    const one = addEvent(empty, TODAY, 'task/add')
    const two = addEvent(one, TODAY, 'task/add', 2)
    expect(empty.days).toEqual({})
    expect(one.days[TODAY]?.events).toEqual({ 'task/add': 1 })
    expect(two.days[TODAY]?.events).toEqual({ 'task/add': 3 })
    const more = addError(addDist(two, TODAY, 'boot', '600'), TODAY, 'TypeError@a.js:1:2')
    expect(more.days[TODAY]).toMatchObject({ dist: { boot: { '600': 1 } }, errors: { 'TypeError@a.js:1:2': 1 } })
    const tapped = addTap(addTap(more, MON, 'agenda', 5, 'row__check', quiet), MON, 'agenda', 5, 'row__check', { rage: true, dead: false, slow: true })
    expect(tapped.weeks[MON]).toEqual({ cells: { 'agenda|5': [2, 1, 0] }, targets: { 'agenda|row__check': [2, 1, 0, 1] } })
    expect(isEmpty(empty)).toBe(true)
    expect(isEmpty(tapped)).toBe(false)
  })

  test('un toque sin efecto se marca después, en su celda y su objetivo', () => {
    const tapped = addTap(emptyPending('1.9', 'web'), MON, 'inbox', 9, 'routine-note', quiet)
    const dead = markDead(tapped, MON, 'inbox', 9, 'routine-note')
    expect(dead.weeks[MON]).toEqual({ cells: { 'inbox|9': [1, 0, 1] }, targets: { 'inbox|routine-note': [1, 0, 1, 0] } })
    expect(markDead(tapped, '2026-10-26', 'inbox', 9, null)).toBe(tapped)
  })

  test('no pasa de los topes del servidor: lo que no cabe se pierde solo', () => {
    let pending = emptyPending('1.9', 'ios')
    for (let i = 0; i < LIMITS.events + 5; i++) pending = addEvent(pending, TODAY, `ui/x${i}`)
    expect(Object.keys(pending.days[TODAY]?.events ?? {})).toHaveLength(LIMITS.events)
    for (let i = 0; i < LIMITS.errors + 3; i++) pending = addError(pending, TODAY, `E${i}`)
    expect(Object.keys(pending.days[TODAY]?.errors ?? {})).toHaveLength(LIMITS.errors)
  })

  test('lo que no se pudo mandar vuelve a sumarse a lo nuevo', () => {
    const before = setUsage(addTap(addEvent(emptyPending('1.9', 'ios'), TODAY, 'task/add'), MON, 'agenda', 1, null, quiet), TODAY, usage)
    const after = addTap(addDist(addEvent(emptyPending('1.9', 'ios'), TODAY, 'task/add', 2), TODAY, 'sess', '30'), MON, 'agenda', 1, null, quiet)
    const merged = mergePending(before, after)
    expect(merged.days[TODAY]).toEqual({ usage, events: { 'task/add': 3 }, dist: { sess: { '30': 1 } }, errors: {} })
    expect(merged.weeks[MON]?.cells).toEqual({ 'agenda|1': [2, 0, 0] })
  })

  test('el lote dice qué se alcanza por primera vez hoy y no repite lo ya contado', () => {
    const pending = addError(addEvent(addEvent(setUsage(emptyPending('1.9', 'ios'), TODAY, usage), TODAY, 'task/add'), TODAY, 'view/agenda'), TODAY, 'E@a.js:1:1')
    const first = toBatch(pending, {})
    expect(first.batch).toMatchObject({ v: 1, platform: 'ios', version: '1.9' })
    expect(first.batch.days[0]).toMatchObject({ day: TODAY, usage, events: { 'task/add': 1, 'view/agenda': 1 } })
    expect(first.batch.days[0]?.reach?.sort()).toEqual(['E@a.js:1:1', 'task/add', 'view/agenda'])
    const later = toBatch(addEvent(emptyPending('1.9', 'ios'), TODAY, 'task/add', 4), first.reached)
    expect(later.batch.days[0]).toEqual({ day: TODAY, events: { 'task/add': 4 } })
  })

  test('"comparte el detalle" viaja aparte del ping y no se pierde al juntar', () => {
    const marked = setFull(emptyPending('1.9', 'ios'), TODAY, true)
    expect(toBatch(marked, {}).batch.days[0]).toEqual({ day: TODAY, full: { weekly: true } })
    const merged = mergePending(marked, setFull(emptyPending('1.9', 'ios'), TODAY, false))
    expect(merged.days[TODAY]?.full).toEqual({ weekly: true })
  })

  test('las celdas y los objetivos viajan como filas; una pantalla con dos puntos no se rompe', () => {
    const pending = addTap(emptyPending('1.9', 'ios'), MON, 'welcome:dictate', 40, 'welcome__next', { rage: false, dead: true, slow: false })
    const { batch } = toBatch(pending, {})
    expect(batch.weeks).toEqual([{ week: MON, cells: [['welcome:dictate', 40, 1, 0, 1]], targets: [['welcome:dictate', 'welcome__next', 1, 0, 1, 0]] }])
  })

  test('el lote nunca pasa de lo que admite el servidor: se quedan los toques más repetidos', () => {
    let pending = emptyPending('1.9', 'ios')
    for (let cell = 0; cell < 512; cell++) {
      for (let n = 0; n <= cell % 3; n++) pending = addTap(pending, MON, 'agenda', cell, null, quiet)
    }
    for (let cell = 0; cell < 300; cell++) pending = addTap(pending, MON, 'inbox', cell, null, quiet)
    const { batch } = toBatch(addEvent(pending, TODAY, 'view/agenda'), {})
    const cells = batch.weeks.flatMap((w) => w.cells)
    // 812 celdas no caben: van todas las de 2 y 3 toques (341) y, del resto, las que quepan.
    expect(cells.length + 1).toBe(MAX_BATCH_ROWS)
    expect(cells.filter((row) => Number(row[2]) >= 2)).toHaveLength(341)
  })

  test('solo van los 8 días y las 2 semanas más recientes', () => {
    let pending = emptyPending('1.9', 'web')
    for (let d = 1; d <= 10; d++) pending = addEvent(pending, `2026-11-${String(d).padStart(2, '0')}`, 'view/agenda')
    for (const week of ['2026-10-19', '2026-10-26', MON]) pending = addTap(pending, week, 'agenda', 1, null, quiet)
    const { batch } = toBatch(pending, {})
    expect(batch.days.map((d) => d.day)).toEqual(['2026-11-10', '2026-11-09', '2026-11-08', '2026-11-07', '2026-11-06', '2026-11-05', '2026-11-04', '2026-11-03'])
    expect(batch.weeks.map((w) => w.week)).toEqual([MON, '2026-10-26'])
  })

  test('al retirar el detalle solo queda lo básico', () => {
    let pending = setFull(setUsage(emptyPending('1.9', 'ios'), TODAY, usage), TODAY, true)
    pending = addEvent(addEvent(addEvent(pending, TODAY, 'view/agenda'), TODAY, 'sessions'), TODAY, 'task/add')
    pending = addDist(addDist(pending, TODAY, 'lat', '50'), TODAY, 'boot', '300')
    pending = addTap(pending, MON, 'agenda', 3, null, quiet)
    const basic = basicOnly(pending)
    expect(basic.weeks).toEqual({})
    expect(basic.days[TODAY]).toEqual({
      usage,
      events: { 'view/agenda': 1, sessions: 1 },
      dist: { boot: { '300': 1 } },
      errors: {},
    })
  })
})
