import { useCallback, useEffect, useRef, useState } from 'react'
import { nextUtcMidnight, shortTime, timeOfInstant } from '../../lib/date'
import { pick } from '../../lib/i18n'
import { isNative } from '../../lib/platform'
import { PushApiError } from '../../lib/push/api'
import type { Capture } from '../../lib/voice/capture'
import { createAudioContext, startCapture } from '../../lib/voice/capture'
import { speechSupported, startSpeech } from '../../lib/voice/speech'
import { TARGET_RATE, bytesToBase64, encodeWav, resample } from '../../lib/voice/wav'
import { useAppState, useDispatch } from '../../state/StoreProvider'
import { usePush } from '../push/PushProvider'
import { useToast } from '../ui/Toast'

export type VoicePhase = 'idle' | 'listening' | 'processing'

/**
 * Whisper más la IA tardan unos segundos; si el servidor se queda colgado, la barra no puede
 * quedarse en "Creando tarea…" para siempre.
 */
const TRANSCRIBE_TIMEOUT_MS = 25_000

interface Session {
  stop: () => void
  cancel: () => void
}

const TEXT = {
  es: {
    allowMic: 'Permite el acceso al micrófono para dictar.',
    noMic: 'No se encuentra ningún micrófono.',
    quota: (clock: string) => `Dictado agotado por hoy. Vuelve a las ${clock}.`,
    transcribe: 'No se ha podido transcribir el audio.',
    failed: 'No se pudo dictar.',
    notUnderstood: 'No te he entendido.',
    micDenied: 'Sin acceso al micrófono.',
    settings: 'Ajustes',
    notHeard: 'No te he oído.',
    slow: 'El dictado está tardando demasiado. Prueba otra vez.',
    unavailable: 'El dictado no está disponible en este navegador.',
    enableReminders: 'Activa los avisos en Ajustes para dictar tareas.',
  },
  en: {
    allowMic: 'Allow microphone access to dictate.',
    noMic: 'No microphone found.',
    quota: (clock: string) => `Dictation is used up for today. Back at ${clock}.`,
    transcribe: 'The audio couldn’t be transcribed.',
    failed: 'Dictation failed.',
    notUnderstood: 'I didn’t catch that.',
    micDenied: 'No microphone access.',
    settings: 'Settings',
    notHeard: 'I didn’t hear you.',
    slow: 'Dictation is taking too long. Try again.',
    unavailable: 'Dictation isn’t available in this browser.',
    enableReminders: 'Turn on reminders in Settings to dictate tasks.',
  },
} as const

function micDenied(error: unknown): boolean {
  return error instanceof DOMException && (error.name === 'NotAllowedError' || error.name === 'SecurityError')
}

function errorMessage(error: unknown): string {
  const text = pick(TEXT)
  if (micDenied(error)) return text.allowMic
  if (error instanceof DOMException && error.name === 'NotFoundError') return text.noMic
  // 503: el servidor ha gastado la cuota diaria de Workers AI, que se renueva a las 00:00 UTC.
  if (error instanceof PushApiError && error.status === 503) return text.quota(shortTime(timeOfInstant(nextUtcMidnight(Date.now()))))
  if (error instanceof PushApiError && error.status === 502) return text.transcribe
  return error instanceof Error ? error.message : text.failed
}

/**
 * Dictado de tareas. Con los avisos activos graba y transcribe en el servidor (Whisper): es lo
 * único que funciona en la app instalada de iPhone. Si no, usa el dictado del navegador.
 */
export function useVoice(onText: (text: string, interpreted: unknown) => void) {
  const push = usePush()
  const toast = useToast()
  const allowed = useAppState().settings.dictation
  const dispatch = useDispatch()
  /** Contando adónde va el audio antes de que el sistema pida el micrófono: nada sale del móvil sin eso. */
  const [asking, setAsking] = useState(false)
  const [phase, setPhase] = useState<VoicePhase>('idle')
  const [level, setLevel] = useState(0)
  const [partial, setPartial] = useState('')
  const session = useRef<Session | null>(null)

  /** Solo la sesión vigente puede devolver la barra a reposo: una cancelada no pisa a la siguiente. */
  const finish = useCallback((owner: Session) => {
    if (session.current !== owner) return
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
      else toast({ message: pick(TEXT).notUnderstood })
    },
    [onText, toast],
  )

  /** En el iPhone, sin micrófono no hay dictado: el aviso lleva a Ajustes, que es donde se da. */
  const fail = useCallback(
    (error: unknown) => {
      if (isNative && micDenied(error)) {
        const text = pick(TEXT)
        toast({
          message: text.micDenied,
          actionLabel: text.settings,
          onAction: () => void import('../../lib/platform/native').then(({ TasksNative }) => TasksNative.openSettings()),
        })
        return
      }
      toast({ message: errorMessage(error) })
    },
    [toast],
  )

  /** `granted`: se llama cuando el sistema ya ha dado el micrófono y empieza a grabar. */
  const record = useCallback((granted?: () => void) => {
    // El contexto de audio se crea antes de cualquier await: iOS lo exige dentro del gesto.
    let context: AudioContext
    try {
      context = createAudioContext()
    } catch (error) {
      fail(error)
      return
    }

    const controller = new AbortController()
    let capture: Capture | null = null
    let timedOut = false
    // Cancelar sirve en cualquier fase: pidiendo permiso, grabando o esperando al servidor.
    const current: Session = {
      stop: () => capture?.stop(),
      cancel: () => {
        controller.abort()
        capture?.cancel()
        finish(current)
      },
    }
    session.current = current
    setPhase('listening')

    void (async () => {
      let timer: ReturnType<typeof setTimeout> | undefined
      try {
        capture = await startCapture(context, setLevel)
        if (controller.signal.aborted) {
          capture.cancel()
          return
        }
        granted?.()
        const audio = await capture.result
        if (audio.status === 'cancelled' || controller.signal.aborted) return
        if (audio.status === 'silent') {
          toast({ message: pick(TEXT).notHeard })
          return
        }
        setPhase('processing')
        const wav = encodeWav(resample(audio.samples, audio.sampleRate), TARGET_RATE)
        timer = setTimeout(() => {
          timedOut = true
          controller.abort()
        }, TRANSCRIBE_TIMEOUT_MS)
        const { text, tasks } = await push.transcribe(bytesToBase64(wav), controller.signal)
        if (!controller.signal.aborted) deliver(text, tasks)
      } catch (error) {
        if (timedOut) toast({ message: pick(TEXT).slow })
        else if (!controller.signal.aborted) fail(error)
      } finally {
        clearTimeout(timer)
        finish(current)
      }
    })()
  }, [deliver, fail, finish, push, toast])

  const dictate = useCallback(() => {
    try {
      const speech = startSpeech(setPartial)
      session.current = speech
      setPhase('listening')
      speech.result
        .then((text) => deliver(text))
        .catch((error: unknown) => toast({ message: errorMessage(error) }))
        .finally(() => finish(speech))
    } catch (error) {
      toast({ message: errorMessage(error) })
    }
  }, [deliver, finish, toast])

  const start = useCallback(() => {
    if (phase !== 'idle') return
    if (push.canTranscribe) return allowed ? record() : setAsking(true)
    if (speechSupported()) return dictate()
    toast({
      message: push.status === 'unconfigured' || push.status === 'unsupported' ? pick(TEXT).unavailable : pick(TEXT).enableReminders,
    })
  }, [allowed, dictate, phase, push.canTranscribe, push.status, record, toast])

  /**
   * Graba en el mismo toque de "Continuar": iOS solo abre el audio dentro de un gesto. El permiso
   * queda dado cuando el sistema concede el micrófono; si lo niega, el aviso vuelve la próxima vez.
   */
  const proceed = useCallback(() => {
    setAsking(false)
    record(() => dispatch({ type: 'settings/dictation', allowed: true }))
  }, [dispatch, record])

  const stop = useCallback(() => session.current?.stop(), [])
  const cancel = useCallback(() => session.current?.cancel(), [])

  useEffect(() => () => session.current?.cancel(), [])

  return { phase, level, partial, start, stop, cancel, asking, proceed }
}
