import { expect, test } from 'vitest'
import { framePoints } from './mapFrame'

test('un solo punto va al centro de la zona útil', () => {
  const [point] = framePoints([{ lat: 40, lng: -3 }])
  expect(point!.x).toBeCloseTo(0.5)
  expect(point!.y).toBeCloseTo(0.47)
})

test('varios puntos llenan la caja con margen, el norte arriba', () => {
  const [a, b] = framePoints([
    { lat: 40, lng: -4 },
    { lat: 41, lng: -3 },
  ])
  expect(a!.x).toBeCloseTo(0.18)
  expect(a!.y).toBeCloseTo(0.68)
  expect(b!.x).toBeCloseTo(0.82)
  expect(b!.y).toBeCloseTo(0.26)
})

test('sin puntos, nada', () => {
  expect(framePoints([])).toEqual([])
})
