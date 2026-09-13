import { describe, expect, test } from 'vitest'
import { TARGET_RATE, bytesToBase64, encodeWav, mergeChunks, resample, rms } from './wav'

describe('mergeChunks / rms', () => {
  test('concatena bloques en orden', () => {
    const merged = mergeChunks([new Float32Array([1, 2]), new Float32Array([3])])
    expect(Array.from(merged)).toEqual([1, 2, 3])
  })

  test('rms de silencio, señal constante y vacío', () => {
    expect(rms(new Float32Array(10))).toBe(0)
    expect(rms(new Float32Array([0.5, -0.5]))).toBeCloseTo(0.5)
    expect(rms(new Float32Array())).toBe(0)
  })
})

describe('resample', () => {
  test('de 48 kHz a 16 kHz promedia de tres en tres', () => {
    const input = new Float32Array([0, 0.3, 0.6, 1, 1, 1])
    expect(Array.from(resample(input, 48_000, TARGET_RATE)).map((v) => Number(v.toFixed(2)))).toEqual([0.3, 1])
  })

  test('misma frecuencia devuelve una copia', () => {
    const input = new Float32Array([0.1, 0.2])
    const output = resample(input, TARGET_RATE)
    expect(Array.from(output)).toEqual(Array.from(input))
    expect(output).not.toBe(input)
  })

  test('subir de frecuencia repite muestras', () => {
    expect(resample(new Float32Array([0.5, -0.5]), 8_000, 16_000)).toHaveLength(4)
  })
})

describe('encodeWav', () => {
  test('cabecera RIFF/WAVE PCM 16 bits mono y muestras recortadas', () => {
    const wav = encodeWav(new Float32Array([0, 1, -1, 2]), TARGET_RATE)
    const view = new DataView(wav.buffer)
    const ascii = (from: number, to: number) => String.fromCharCode(...wav.slice(from, to))
    expect(ascii(0, 4)).toBe('RIFF')
    expect(ascii(8, 12)).toBe('WAVE')
    expect(view.getUint16(22, true)).toBe(1)
    expect(view.getUint32(24, true)).toBe(TARGET_RATE)
    expect(view.getUint16(34, true)).toBe(16)
    expect(view.getUint32(40, true)).toBe(8)
    expect([0, 1, 2, 3].map((i) => view.getInt16(44 + i * 2, true))).toEqual([0, 32767, -32768, 32767])
  })
})

describe('bytesToBase64', () => {
  test('ida y vuelta exacta también para audios grandes', () => {
    const bytes = Uint8Array.from({ length: 100_000 }, (_, i) => (i * 7) % 256)
    const decoded = Uint8Array.from(atob(bytesToBase64(bytes)), (char) => char.charCodeAt(0))
    expect(decoded).toEqual(bytes)
    expect(bytesToBase64(new Uint8Array([251, 255]))).toBe('+/8=')
  })
})
