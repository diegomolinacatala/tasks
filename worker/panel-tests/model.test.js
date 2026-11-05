import { describe, expect, test } from 'vitest'
import {
  K,
  addDays,
  dau,
  distribution,
  event,
  mau,
  mondayOf,
  percentileBucket,
  rangeFor,
  retention,
  shape,
  wau,
} from '../panel/uso/model.js'

const range = { from: '2026-11-01', to: '2026-11-05' }

const data = {
  daily: [
    ['2026-11-02', 'ios', '1.9', 'u:day', 3, 3],
    ['2026-11-02', 'web', '1.8', 'u:day', 1, 1],
    ['2026-11-02', 'ios', '1.9', 'u:week', 3, 3],
    ['2026-11-02', 'web', '1.8', 'u:week', 1, 1],
    ['2026-11-02', 'ios', '1.9', 'u:fullweek', 2, 2],
    ['2026-11-02', 'ios', '1.9', 'u:full', 2, 2],
    ['2026-11-01', 'ios', '1.9', 'u:month', 4, 4],
    ['2026-11-05', 'ios', '1.9', 'u:day', 2, 2],
    ['2026-11-05', 'ios', '1.9', 'u:first', 1, 1],
    ['2026-10-20', 'ios', '1.9', 'u:day', 9, 9],
  ],
  names: [
    ['e:task/add', 7, 3],
    ['d:boot:300', 6, 0],
    ['d:boot:600', 3, 0],
    ['d:boot:inf', 1, 0],
  ],
  previous: [['e:task/add', 5, 2]],
  cohorts: [
    ['2026-10-26', '2026-10-26', 4],
    ['2026-11-02', '2026-10-26', 2],
    ['2026-11-02', '2026-11-02', 2],
  ],
  screens: [['1.9', 'agenda', 30]],
}

describe('el modelo del panel', () => {
  test('fechas: el lunes, sumar días y el periodo que se mira', () => {
    expect(mondayOf('2026-11-05')).toBe('2026-11-02')
    expect(mondayOf('2026-11-08')).toBe('2026-11-02')
    expect(addDays('2026-11-01', -1)).toBe('2026-10-31')
    expect(rangeFor(7, '2026-11-05')).toEqual({ from: '2026-10-30', to: '2026-11-05' })
  })

  test('suma los pings del periodo (lo de fuera no cuenta) y sus bases', () => {
    const model = shape(data, range)
    expect(dau(model, '2026-11-02')).toBe(4)
    expect(dau(model, '2026-11-05')).toBe(2)
    expect(model.deviceDays).toBe(6)
    expect(model.fullDays).toBe(2)
    expect(wau(model, '2026-11-05')).toBe(4)
    expect(mau(model, '2026-11-05')).toBe(4)
    expect(model.baseBasic).toBe(4)
    expect(model.baseFull).toBe(2)
    expect(event(model, 'task/add')).toEqual({ events: 7, devices: 3 })
    expect(event(model, 'task/add', 'before')).toEqual({ events: 5, devices: 2 })
    expect(event(model, 'nada')).toEqual({ events: 0, devices: 0 })
  })

  test('con una versión elegida, las bases también son de esa versión', () => {
    const model = shape(data, range, '1.8')
    expect(model.deviceDays).toBe(1)
    expect(model.fullDays).toBe(0)
    expect(model.baseBasic).toBe(1)
  })

  test('las distribuciones van en el orden de sus tramos, y su mediana', () => {
    const model = shape(data, range)
    const boot = distribution(model, 'boot', ['300', '600', '1000', 'inf'])
    expect(boot).toEqual([
      { bucket: '300', value: 6 },
      { bucket: '600', value: 3 },
      { bucket: '1000', value: 0 },
      { bucket: 'inf', value: 1 },
    ])
    expect(percentileBucket(boot, 0.5)).toBe('300')
    expect(percentileBucket(boot, 0.9)).toBe('600')
    expect(percentileBucket([], 0.5)).toBeNull()
  })

  test(`una cohorte de menos de ${K} no enseña porcentajes`, () => {
    const model = shape(data, range)
    const [recent, older] = retention(model)
    expect(recent).toMatchObject({ cohort: '2026-11-02', size: 2, hidden: true })
    expect(older).toMatchObject({ cohort: '2026-10-26', size: 4, hidden: false })
    expect(older.cells.map((c) => c.share)).toEqual([1, 0.5])
  })
})
