import type { SpeechLanguage, Transcriber } from './types'

const MODEL = '@cf/openai/whisper-large-v3-turbo'
const MAX_TEXT_CHARS = 500

/** Contexto para que Whisper acierte con horas, días y verbos típicos de una tarea, en cada idioma. */
const PROMPTS: Record<SpeechLanguage, string> = {
  es: 'Llamar a Miguel hoy a las 17:00 y recuérdamelo 10 minutos antes. Dentista el lunes a las 9:30.',
  en: 'Call Mike today at 5pm and remind me 10 minutes before. Dentist on Monday at 9:30am.',
}

/** Frases que Whisper inventa sobre audio vacío o ruido (vienen de subtítulos de su entrenamiento). */
const HALLUCINATIONS = [/amara\.org/i, /subt[ií]tulos (realizados|por)/i, /gracias por ver/i, /thanks? (you )?for watching/i, /^\W*$/]

/** Workers AI responde "4006: you have used up your daily free allocation…" al agotar las neuronas del día. */
export function isQuotaExceeded(error: unknown): boolean {
  return error instanceof Error && /\b4006\b|daily free allocation/i.test(error.message)
}

export function cleanTranscript(raw: string): string {
  const text = raw.replace(/\s+/g, ' ').trim().slice(0, MAX_TEXT_CHARS)
  return HALLUCINATIONS.some((pattern) => pattern.test(text)) ? '' : text
}

/** Transcripción con Workers AI. El audio no se guarda ni se registra. */
export function workersAiTranscriber(ai: Ai): Transcriber {
  return {
    async transcribe(audio, language) {
      const output = await ai.run(MODEL, { audio, language, vad_filter: true, initial_prompt: PROMPTS[language] })
      return cleanTranscript(output.text ?? '')
    },
  }
}
