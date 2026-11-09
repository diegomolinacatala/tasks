import { afterEach, describe, expect, test, vi } from 'vitest'
import type { FeedbackReport } from './feedback'
import {
  MAX_ELEMENTS,
  MAX_MESSAGE,
  MAX_SHOT_CHARS,
  SEND_TIMEOUT_MS,
  cleanMessage,
  describeElements,
  deviceLabel,
  feedbackBody,
  isTap,
  postFeedback,
  regionOf,
  samplePoints,
  strokeLength,
  strokePath,
  tapRing,
} from './feedback'
import { setLanguage } from './i18n'

const VIEWPORT = { width: 390, height: 844 }

const report = (overrides: Partial<FeedbackReport> = {}): FeedbackReport => ({
  message: 'El botón se ve pequeño',
  shot: 'data:image/jpeg;base64,/9j/AAAA',
  context: {
    screen: 'agenda',
    sheet: null,
    region: { x: 10, y: 20, width: 100, height: 50 },
    viewport: VIEWPORT,
    elements: ['Cena — tl-row'],
    app: { version: '1.4 (33)', platform: 'ios', language: 'es', theme: 'light' },
    device: 'iPhone · iOS 18.5',
  },
  ...overrides,
})

describe('trazo', () => {
  test('mide lo recorrido y distingue un toque de un trazo', () => {
    const line = [
      { x: 0, y: 0 },
      { x: 3, y: 4 },
      { x: 3, y: 14 },
    ]
    expect(strokeLength(line)).toBe(15)
    expect(isTap(line)).toBe(true)
    expect(isTap([...line, { x: 30, y: 14 }])).toBe(false)
  })

  test('un toque rodea un círculo alrededor del dedo', () => {
    const ring = tapRing({ x: 100, y: 100 }, 36, 4)
    expect(ring).toHaveLength(5)
    expect(ring[0]).toEqual({ x: 136, y: 100 })
    expect(ring[2]!.x).toBeCloseTo(64)
  })

  test('la zona abarca el trazo con aire y no se sale de la pantalla', () => {
    const loop = [
      { x: 50, y: 100 },
      { x: 150, y: 90 },
      { x: 160, y: 200 },
      { x: 40, y: 210 },
    ]
    expect(regionOf(loop, VIEWPORT)).toEqual({ x: 32, y: 82, width: 136, height: 136 })
    const edge = [
      { x: 2, y: 2 },
      { x: 60, y: 3 },
      { x: 60, y: 50 },
    ]
    expect(regionOf(edge, VIEWPORT)).toMatchObject({ x: 0, y: 0 })
    expect(regionOf([], VIEWPORT)).toBeNull()
  })

  test('un toque da una zona alrededor del punto', () => {
    expect(regionOf([{ x: 200, y: 300 }], VIEWPORT)).toEqual({ x: 156, y: 256, width: 88, height: 88 })
  })

  test('el trazo suavizado empieza y acaba en sus extremos', () => {
    const path = strokePath([
      { x: 0, y: 0 },
      { x: 10, y: 10 },
      { x: 20, y: 0 },
      { x: 30.04, y: 10 },
    ])
    expect(path.startsWith('M0 0 Q10 10 15 5')).toBe(true)
    expect(path.endsWith('L30 10')).toBe(true)
    expect(strokePath([{ x: 1, y: 2 }])).toBe('M1 2')
    expect(strokePath([])).toBe('')
  })

  test('reparte puntos por dentro de la zona', () => {
    const points = samplePoints({ x: 0, y: 0, width: 100, height: 50 }, 2)
    expect(points).toEqual([
      { x: 25, y: 12.5 },
      { x: 75, y: 12.5 },
      { x: 25, y: 37.5 },
      { x: 75, y: 37.5 },
    ])
  })
})

describe('lo que se cuenta', () => {
  const found = [
    { label: 'Cena   con\nCarlota', path: 'agenda › tl-row' },
    { label: 'Cena con Carlota', path: 'agenda › tl-row' },
    { label: '', path: 'agenda › tl__now' },
    { label: 'x'.repeat(200), path: 'agenda' },
  ]

  test('junta texto y sitio, sin repetir y recortando', () => {
    const lines = describeElements(found, true)
    expect(lines[0]).toBe('Cena con Carlota — agenda › tl-row')
    expect(lines[1]).toBe('agenda › tl__now')
    expect(lines).toHaveLength(3)
    expect(lines[2]!.length).toBeLessThan(100)
    expect(lines[2]!.includes('…')).toBe(true)
  })

  test('sin la foto, solo el sitio', () => {
    expect(describeElements(found, false)).toEqual(['agenda › tl-row', 'agenda › tl__now', 'agenda'])
  })

  test('como mucho unas pocas líneas', () => {
    const many = Array.from({ length: 30 }, (_, i) => ({ label: `t${i}`, path: 'p' }))
    expect(describeElements(many, true)).toHaveLength(MAX_ELEMENTS)
  })

  test('limpia el mensaje', () => {
    expect(cleanMessage('  hola\r\n\n\n\nadiós  ')).toBe('hola\n\nadiós')
    expect(cleanMessage('a'.repeat(MAX_MESSAGE + 50))).toHaveLength(MAX_MESSAGE)
  })

  test('nombra el dispositivo sin nada que identifique a nadie', () => {
    expect(
      deviceLabel('Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148'),
    ).toBe('iPhone · iOS 18.5')
    expect(
      deviceLabel(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36 Edg/140.0.0.0',
      ),
    ).toBe('Windows · Edge')
    expect(deviceLabel('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/18.0 Safari/605.1.15')).toBe(
      'Mac · Safari',
    )
  })
})

describe('envío', () => {
  afterEach(() => setLanguage('es'))

  test('la foto viaja sin cabecera y solo si es un JPEG que cabe', () => {
    expect(feedbackBody(report()).shot).toBe('/9j/AAAA')
    expect(feedbackBody(report({ shot: 'data:image/png;base64,iVBOR' })).shot).toBeNull()
    expect(feedbackBody(report({ shot: `data:image/jpeg;base64,${'A'.repeat(MAX_SHOT_CHARS + 1)}` })).shot).toBeNull()
    expect(feedbackBody(report({ shot: null })).shot).toBeNull()
  })

  test('manda la sugerencia al buzón', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ data: { id: 'x' } }), { status: 201 }))
    await postFeedback('https://api.example.com/', report(), fetchImpl)
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://api.example.com/v1/feedback')
    expect(init.method).toBe('POST')
    expect(JSON.parse(String(init.body))).toMatchObject({ message: 'El botón se ve pequeño', shot: '/9j/AAAA' })
  })

  test('no manda un mensaje vacío', async () => {
    const fetchImpl = vi.fn()
    await expect(postFeedback('https://api.example.com', report({ message: '   ' }), fetchImpl)).rejects.toThrow('Escribe algo')
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  test('explica los fallos en el idioma de la app', async () => {
    setLanguage('en')
    await expect(
      postFeedback('https://api.example.com', report(), async () => {
        throw new TypeError('offline')
      }),
    ).rejects.toThrow('No connection')
    setLanguage('es')
    await expect(postFeedback('https://api.example.com', report(), async () => new Response('', { status: 429 }))).rejects.toThrow(
      'Demasiadas',
    )
    await expect(postFeedback('https://api.example.com', report(), async () => new Response('', { status: 500 }))).rejects.toThrow(
      'error 500',
    )
    await expect(postFeedback('https://api.example.com', report(), async () => new Response('', { status: 507 }))).rejects.toThrow(
      'lleno',
    )
  })

  test('una subida atascada se corta y se explica como falta de conexión', async () => {
    vi.useFakeTimers()
    try {
      const stalled = (_url: string, init?: RequestInit) =>
        new Promise<Response>((_, reject) => init?.signal?.addEventListener('abort', () => reject(new DOMException('', 'AbortError'))))
      const sending = postFeedback('https://api.example.com', report(), stalled)
      const failure = expect(sending).rejects.toThrow('Sin conexión')
      await vi.advanceTimersByTimeAsync(SEND_TIMEOUT_MS)
      await failure
    } finally {
      vi.useRealTimers()
    }
  })
})
