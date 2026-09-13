import { describe, expect, test } from 'vitest'
import { classify } from './push'
import { bearerToken, randomToken, sha256Hex, toBase64Url } from './auth'

describe('auth', () => {
  test('los tokens son aleatorios y base64url de 256 bits', () => {
    const token = randomToken()
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(randomToken()).not.toBe(token)
  })

  test('sha256Hex coincide con el vector conocido', async () => {
    expect(await sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
  })

  test('toBase64Url no usa + / ni relleno', () => {
    expect(toBase64Url(new Uint8Array([251, 255, 191]))).toBe('-_-_')
  })

  test('bearerToken solo acepta el formato esperado', () => {
    const withAuth = (value: string) => new Request('https://x.dev', { headers: { authorization: value } })
    expect(bearerToken(withAuth(`Bearer ${'a'.repeat(43)}`))).toBe('a'.repeat(43))
    expect(bearerToken(withAuth('Bearer corto'))).toBeNull()
    expect(bearerToken(withAuth(`Basic ${'a'.repeat(43)}`))).toBeNull()
    expect(bearerToken(new Request('https://x.dev'))).toBeNull()
  })
})

describe('classify (respuesta del servicio push)', () => {
  test.each([
    [201, 'sent'],
    [200, 'sent'],
    [404, 'gone'],
    [410, 'gone'],
    [403, 'unauthorized'],
    [401, 'unauthorized'],
    [400, 'rejected'],
    [413, 'rejected'],
    [429, 'retry'],
    [500, 'retry'],
  ])('%i → %s', (status, expected) => {
    expect(classify(status)).toBe(expected)
  })
})
