import { useCallback, useEffect, useRef, useState } from 'react'
import { createAudioContext, startCapture } from '../../lib/voice/capture'
import { speechSupported, startSpeech } from '../../lib/voice/speech'
import { TARGET_RATE, bytesToBase64, encodeWav, resample } from '../../lib/voice/wav'
import { usePush } from '../push/PushProvider'
import { useToast } from '../ui/Toast'

export type VoicePhase = 'idle' | 'listening' | 'processing'

interface Session {
  stop: () => void
  cancel: () => void
}

function errorMessage(error: unknown): string {
  if (error instanceof DOMException && (error.name === 'NotAllowedError' || error.name === 'SecurityError')) {
    return 'Permite el acceso al micrófono para dictar.'
  }
  if (error instanceof DOMException && error.name === 'NotFoundError') return 'No se encuentra ningún micrófono.'
  return error instanceof Error ? error.message : 'No se pudo dictar.'
}

/**
 * Dictado de tareas. Con los avisos activos graba y transcribe en el servidor (Whisper): es lo
 * único que funciona en la app instalada de iPhone. Si no, usa el dictado del navegador.
 */
export function useVoice(onText: (text: string, interpreted: unknown) => void) {
  const push = usePush()
  const toast = useToast()
  const [phase, setPhase] = useState<VoicePhase>('idle')
  const [level, setLevel] = useState(0)
  const [partial, setPartial] = useState('')
  const session = useRef<Session | null>(null)

  const reset = useCallback(() => {
    session.current = null
    setPhase('idle')
    setLevel(0)
    setPartial('')
  }, [])

  /** `interpreted`: tareas que devolvió la IA del servidor, o `null` con el dictado del navegador. */
  const deliver = useCallback(
    (text: string | null, interpreted: unknown = null) => {
      if (text === null) return
      if (text.trim()) onText(text, interpreted)
      else toast({ message: 'No te he entendido.' })
    },
    [onText, toast],
  )

  const record = useCallback(() => {
    // El contexto de audio se crea antes de cualquier await: iOS lo exige dentro del gesto.
    let context: AudioContext
    try {
      context = createAudioContext()
    } catch (error) {
      toast({ message: errorMessage(error) })
      return
    }
    setPhase('listening')
    void (async () => {
      try {
        const capture = await startCapture(context, setLevel)
        session.current = capture
        const audio = await capture.result
        session.current = null
        if (audio.status === 'cancelled') return
        if (audio.status === 'silent') {
          toast({ message: 'No te he oído.' })
          return
        }
        setPhase('processing')
        const wav = encodeWav(resample(audio.samples, audio.sampleRate), TARGET_RATE)
        const { text, tasks } = await push.transcribe(bytesToBase64(wav))
        deliver(text, tasks)
      } catch (error) {
        toast({ message: errorMessage(error) })
      } finally {
        reset()
      }
    })()
  }, [deliver, push, reset, toast])

  const dictate = useCallback(() => {
    setPhase('listening')
    try {
      const speech = startSpeech(setPartial)
      session.current = speech
      speech.result
        .then((text) => deliver(text))
        .catch((error: unknown) => toast({ message: errorMessage(error) }))
        .finally(reset)
    } catch (error) {
      toast({ message: errorMessage(error) })
      reset()
    }
  }, [deliver, reset, toast])

  const start = useCallback(() => {
    if (phase !== 'idle') return
    if (push.status === 'on') return record()
    if (speechSupported()) return dictate()
    toast({
      message:
        push.status === 'unconfigured' || push.status === 'unsupported'
          ? 'El dictado no está disponible en este navegador.'
          : 'Activa los avisos en Ajustes para dictar tareas.',
    })
  }, [dictate, phase, push.status, record, toast])

  const stop = useCallback(() => session.current?.stop(), [])
  const cancel = useCallback(() => session.current?.cancel(), [])

  useEffect(() => () => session.current?.cancel(), [])

  return { phase, level, partial, start, stop, cancel }
}
