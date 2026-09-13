import { describe, expect, test } from 'vitest'
import { subscription } from './testing'
import {
  MAX_ITEMS,
  isAllowedPushEndpoint,
  isValidVapidSubject,
  parseAudio,
  parsePayload,
  parseSchedule,
  parseSubscription,
} from './validate'

const NOW = Date.UTC(2026, 8, 11)

describe('isValidVapidSubject', () => {
  test.each(['mailto:tasks@example.org', 'https://diegomolinacatala.github.io/tasks/', 'https://example.org'])(
    'acepta %s',
    (subject) => {
      expect(isValidVapidSubject(subject)).toBe(true)
    },
  )

  // Apple responde 403 BadJwtToken a todos estos.
  test.each(['mailto:dev@localhost', 'https://localhost:8787', 'http://example.org', 'tasks@example.org', 'mailto:', ''])(
    'rechaza %s',
    (subject) => {
      expect(isValidVapidSubject(subject)).toBe(false)
    },
  )
})

describe('isAllowedPushEndpoint', () => {
  test.each([
    'https://web.push.apple.com/abc',
    'https://fcm.googleapis.com/fcm/send/abc',
    'https://updates.push.services.mozilla.com/wpush/v2/abc',
    'https://wns2-par02p.notify.windows.com/w/?token=abc',
  ])('acepta %s', (url) => {
    expect(isAllowedPushEndpoint(url)).toBe(true)
  })

  test.each([
    'http://web.push.apple.com/abc',
    'https://web.push.apple.com:8443/abc',
    'https://user:pass@web.push.apple.com/abc',
    'https://evil.com/web.push.apple.com',
    'https://web.push.apple.com.evil.com/abc',
    'https://notify.windows.com.evil.com/',
    'https://169.254.169.254/latest/meta-data',
    'no es una url',
  ])('rechaza %s', (url) => {
    expect(isAllowedPushEndpoint(url)).toBe(false)
  })
})

describe('parseSubscription', () => {
  test('acepta una suscripción válida y descarta campos extra', () => {
    const result = parseSubscription({ ...subscription(), expirationTime: null, extra: 1 })
    expect(result).toEqual({ ok: true, value: subscription() })
  })

  test.each([
    [null],
    [{ endpoint: 'https://evil.com/x', keys: subscription().keys }],
    [{ endpoint: subscription().endpoint }],
    [{ endpoint: subscription().endpoint, keys: { p256dh: 'corta', auth: 'a'.repeat(22) } }],
    [{ endpoint: subscription().endpoint, keys: { p256dh: 'B'.repeat(87), auth: 'con espacios y más!' } }],
    [{ endpoint: `https://web.push.apple.com/${'x'.repeat(1100)}`, keys: subscription().keys }],
  ])('rechaza %j', (raw) => {
    expect(parseSubscription(raw).ok).toBe(false)
  })
})

describe('parsePayload', () => {
  test('exige base64url de tamaño acotado', () => {
    expect(parsePayload('abc_-123').ok).toBe(true)
    expect(parsePayload('').ok).toBe(false)
    expect(parsePayload('a'.repeat(5000)).ok).toBe(false)
    expect(parsePayload('<script>').ok).toBe(false)
    expect(parsePayload(42).ok).toBe(false)
  })
})

describe('parseSchedule', () => {
  const item = (id: string, at = NOW + 60_000) => ({ id, at, payload: 'cGF5bG9hZA' })

  test('acepta una agenda válida, también vacía', () => {
    expect(parseSchedule({ items: [item('a'), item('b')] }, NOW)).toEqual({ ok: true, value: [item('a'), item('b')] })
    expect(parseSchedule({ items: [] }, NOW)).toEqual({ ok: true, value: [] })
  })

  test('rechaza ids repetidos', () => {
    expect(parseSchedule({ items: [item('a'), item('a')] }, NOW).ok).toBe(false)
  })

  test('rechaza demasiados avisos', () => {
    const items = Array.from({ length: MAX_ITEMS + 1 }, (_, i) => item(`i${i}`))
    expect(parseSchedule({ items }, NOW).ok).toBe(false)
  })

  test.each([
    [{}],
    [{ items: 'x' }],
    [{ items: [null] }],
    [{ items: [{ ...item('a'), id: 'con espacio' }] }],
    [{ items: [{ ...item('a'), at: 1.5 }] }],
    [{ items: [{ ...item('a'), at: -1 }] }],
    [{ items: [{ ...item('a'), at: NOW + 500 * 24 * 3600 * 1000 }] }],
    [{ items: [{ ...item('a'), payload: 'no válido!' }] }],
  ])('rechaza %j', (raw) => {
    expect(parseSchedule(raw, NOW).ok).toBe(false)
  })
})

describe('parseAudio', () => {
  test('base64 estándar de tamaño razonable', () => {
    expect(parseAudio('A'.repeat(1199) + '-').ok).toBe(false)
    expect(parseAudio('UklGR+/='.padStart(1200, 'A')).ok).toBe(true)
    expect(parseAudio('A'.repeat(1199) + '=').ok).toBe(true)
    expect(parseAudio('A'.repeat(10)).ok).toBe(false)
    expect(parseAudio('A'.repeat(2_000_001)).ok).toBe(false)
    expect(parseAudio(null).ok).toBe(false)
  })
})
