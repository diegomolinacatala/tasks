/** Web Speech API: dictado del propio navegador, sin servidor. */

interface RecognitionResultList {
  length: number
  [index: number]: { isFinal: boolean; 0: { transcript: string } }
}

interface Recognition {
  lang: string
  interimResults: boolean
  continuous: boolean
  onresult: ((event: { results: RecognitionResultList }) => void) | null
  onerror: ((event: { error: string }) => void) | null
  onend: (() => void) | null
  start: () => void
  stop: () => void
  abort: () => void
}

type RecognitionConstructor = new () => Recognition

function recognitionConstructor(): RecognitionConstructor | null {
  const scope = window as Window & {
    SpeechRecognition?: RecognitionConstructor
    webkitSpeechRecognition?: RecognitionConstructor
  }
  return scope.SpeechRecognition ?? scope.webkitSpeechRecognition ?? null
}

/** En la app instalada de iOS la API existe pero nunca devuelve nada: ahí no se usa. */
export function speechSupported(): boolean {
  if (!recognitionConstructor()) return false
  const nav = navigator as Navigator & { standalone?: boolean }
  const ios = /iPad|iPhone|iPod/.test(nav.userAgent) || (nav.platform === 'MacIntel' && nav.maxTouchPoints > 1)
  const standalone = window.matchMedia('(display-mode: standalone)').matches || nav.standalone === true
  return !(ios && standalone)
}

export interface SpeechSession {
  stop: () => void
  cancel: () => void
  /** Texto final, o `null` si se canceló. */
  result: Promise<string | null>
}

export function startSpeech(onPartial: (text: string) => void): SpeechSession {
  const Constructor = recognitionConstructor()
  if (!Constructor) throw new Error('Este navegador no permite dictar.')

  const recognition = new Constructor()
  recognition.lang = 'es-ES'
  recognition.interimResults = true
  recognition.continuous = false

  let transcript = ''
  let cancelled = false
  let failure: Error | null = null

  const result = new Promise<string | null>((resolve, reject) => {
    recognition.onresult = (event) => {
      transcript = Array.from({ length: event.results.length }, (_, i) => event.results[i]?.[0].transcript ?? '').join('')
      onPartial(transcript)
    }
    recognition.onerror = (event) => {
      if (event.error === 'aborted' || event.error === 'no-speech') return
      failure = new Error(
        event.error === 'not-allowed' || event.error === 'service-not-allowed'
          ? 'Permite el acceso al micrófono para dictar.'
          : 'No se pudo dictar.',
      )
    }
    recognition.onend = () => {
      if (failure) reject(failure)
      else resolve(cancelled ? null : transcript.trim())
    }
  })

  recognition.start()
  return {
    stop: () => recognition.stop(),
    cancel: () => {
      cancelled = true
      recognition.abort()
    },
    result,
  }
}
