import { describe, expect, test } from 'vitest'
import { cleanTranscript, workersAiTranscriber } from './transcribe'

describe('cleanTranscript', () => {
  test('normaliza espacios y recorta', () => {
    expect(cleanTranscript('  Llamar a  Miguel\n hoy. ')).toBe('Llamar a Miguel hoy.')
    expect(cleanTranscript('x'.repeat(900))).toHaveLength(500)
  })

  test.each(['Subtítulos realizados por la comunidad de Amara.org', '¡Gracias por ver!', ' ... ', ''])(
    'descarta la alucinación «%s»',
    (text) => {
      expect(cleanTranscript(text)).toBe('')
    },
  )
})

describe('workersAiTranscriber', () => {
  test('pide español al modelo y limpia la salida', async () => {
    const calls: unknown[] = []
    const ai = {
      run: async (model: string, input: unknown) => {
        calls.push([model, input])
        return { text: ' Comprar pan mañana ' }
      },
    } as unknown as Ai
    expect(await workersAiTranscriber(ai).transcribe('QUJD')).toBe('Comprar pan mañana')
    expect(calls[0]).toMatchObject(['@cf/openai/whisper-large-v3-turbo', { audio: 'QUJD', language: 'es', vad_filter: true }])
  })
})
