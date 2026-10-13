import { describe, expect, it } from 'vitest'
import { parseMapResult } from './mapPicker'

describe('parseMapResult', () => {
  it('devuelve el punto elegido con su dirección y el nombre del comercio', () => {
    expect(parseMapResult({ lat: 39.47, lng: -0.37, address: ' Calle Mayor 1, Valencia ', name: 'Mercadona' })).toEqual({
      kind: 'pick',
      pick: { location: { lat: 39.47, lng: -0.37, address: 'Calle Mayor 1, Valencia' }, name: 'Mercadona' },
    })
  })

  it('devuelve el lugar que se quiere abrir al explorar', () => {
    expect(parseMapResult({ open: 'p1' })).toEqual({ kind: 'open', placeId: 'p1' })
  })

  it('no devuelve nada si se cierra o si llega algo que no es un punto', () => {
    expect(parseMapResult({ cancelled: true })).toBeNull()
    expect(parseMapResult({ lat: 200, lng: 0 })).toBeNull()
    expect(parseMapResult({ open: '' })).toBeNull()
    expect(parseMapResult(null)).toBeNull()
  })
})
