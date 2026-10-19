import { useCallback, useEffect, useRef, useState } from 'react'
import { nextUtcMidnight, shortTime, timeOfInstant } from '../../lib/date'
import { pick } from '../../lib/i18n'
import { isNative } from '../../lib/platform'
import { PushApiError } from '../../lib/push/api'
import type { Capture } from '../../lib/voice/capture'
import { MAX_MS, createAudioContext, startCapture } from '../../lib/voice/capture'
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
    quota: (clock: string) => `Dictado agotado por hoy (vuelve a las ${clock}). Mientras, escríbela.`,
    transcribe: 'No se ha podido transcribir el audio.',
    failed: 'No se pudo dictar.',
    notUnderstood: 'No te he entendido.',
    micDenied: 'Sin acceso al micrófono.',
    settings: 'Ajustes del iPhone',
    notHeard: 'No te he oído.',
    slow: 'El dictado está tardando demasiado. Prueba otra vez.',
    unavailable: 'El dictado no está disponible en este navegador.',
    enable: 'Activar',
    install: 'Para dictar, añade Tasks a la pantalla de inicio (Compartir → Añadir a pantalla de inicio).',
    blocked: 'Los avisos están bloqueados en el sistema: el dictado los necesita.',
    tooMany: 'Demasiados dictados seguidos. Espera un momento.',
    tooLong: 'Ha sido demasiado largo: dicta frases más cortas.',
    reconnect: 'Hay que volver a conectar el dictado: prueba otra vez.',
    offline: 'Sin conexión. El dictado necesita internet.',
    enableReminders: 'Para dictar, activa los avisos.',
  },
  en: {
    allowMic: 'Allow microphone access to dictate.',
    noMic: 'No microphone found.',
    quota: (clock: string) => `Dictation is used up for today (back at ${clock}). Type it meanwhile.`,
    transcribe: 'The audio couldn’t be transcribed.',
    failed: 'Dictation failed.',
    notUnderstood: 'I didn’t catch that.',
    micDenied: 'No microphone access.',
    settings: 'iPhone Settings',
    notHeard: 'I didn’t hear you.',
    slow: 'Dictation is taking too long. Try again.',
    unavailable: 'Dictation isn’t available in this browser.',
    enable: 'Turn on',
    install: 'To dictate, add Tasks to your Home Screen (Share → Add to Home Screen).',
    blocked: 'Notifications are blocked in the system settings: dictation needs them.',
    tooMany: 'Too many dictations in a row. Wait a moment.',
    tooLong: 'That was too long: dictate shorter sentences.',
    reconnect: 'Dictation needs to reconnect: try again.',
    offline: 'No connection. Dictation needs internet.',
    enableReminders: 'Turn on notifications to dictate.',
  },
} as const

function micDenied(error: unknown): boolean {
  return error instanceof DOMException && (error.name === 'NotAllowedError' || error.name === 'SecurityError')
}

/** Que el sistema negó el micrófono se recuerda: la ficha del permiso ya no tiene nada que pedir. */
const MIC_DENIED_KEY = 'tasks:mic-denied'
/** Cuando quedan estos milisegundos de grabación, la barra enseña la cuenta atrás. */
const COUNTDOWN_MS = 5000

function rememberMicDenied(denied: boolean): void {
  try {
    if (denied) localStorage.setItem(MIC_DENIED_KEY, '1')
    else localStorage.removeItem(MIC_DENIED_KEY)
  } catch {
    // Sin localStorage, se vuelve a preguntar: no pasa nada.
  }
}

function micWasDenied(): boolean {
  try {
    return localStorage.getItem(MIC_DENIED_KEY) === '1'
  } catch {
    return false
  }
}

function errorMessage(error: unknown): string {
  const text = pick(TEXT)
  if (micDenied(error)) return text.allowMic
  if (error instanceof DOMException && error.name === 'NotFoundError') return text.noMic
  // 503: el servidor ha gastado la cuota diaria de Workers AI, que se renueva a las 00:00 UTC.
  if (error instanceof PushApiError && error.status === 503) return text.quota(shortTime(timeOfInstant(nextUtcMidnight(Date.now()))))
  if (error instanceof PushApiError && error.status === 502) return text.transcribe
  if (error instanceof PushApiError && error.status === 429) return text.tooMany
  if (error instanceof PushApiError && error.status === 413) return text.tooLong
  if (error instanceof PushApiError && error.status === 401) return text.reconnect
  if (error instanceof PushApiError && error.status === 0) return text.offline
  return error instanceof PushApiError ? text.failed : error instanceof Error ? error.message : text.failed
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
  // Segundos que quedan de grabación cuando se acerca el tope (30 s): antes, nada.
  const [remaining, setRemaining] = useState<number | null>(null)
  const session = useRef<Session | null>(null)

  /** Solo la sesión vigente puede devolver la barra a reposo: una cancelada no pisa a la siguiente. */
  const finish = useCallback((owner: Session) => {
    if (session.current !== owner) return
    session.current = null
    setPhase('idle')
    setLevel(0)
    setPartial('')
    setRemaining(null)
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

  /** El sistema negó el micrófono: desde entonces el toque va directo al aviso, sin la ficha del permiso. */
  const deniedToast = useCallback(() => {
    const text = pick(TEXT)
    if (isNative) {
      toast({
        message: text.micDenied,
        actionLabel: text.settings,
        tone: 'error',
        onAction: () => void import('../../lib/platform/native').then(({ TasksNative }) => TasksNative.openSettings()),
      })
    } else {
      toast({ message: text.allowMic, tone: 'error' })
    }
  }, [toast])

  const fail = useCallback(
    (error: unknown) => {
      if (micDenied(error)) {
        rememberMicDenied(true)
        deniedToast()
        return
      }
      toast({ message: errorMessage(error), tone: 'error' })
    },
    [deniedToast, toast],
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
      let countdown: ReturnType<typeof setInterval> | undefined
      try {
        capture = await startCapture(context, setLevel)
        if (controller.signal.aborted) {
          capture.cancel()
          return
        }
        rememberMicDenied(false)
        granted?.()
        const startedAt = Date.now()
        countdown = setInterval(() => {
          const left = MAX_MS - (Date.now() - startedAt)
          setRemaining(left <= COUNTDOWN_MS ? Math.max(0, Math.ceil(left / 1000)) : null)
        }, 500)
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
        clearInterval(countdown)
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
    if (push.canTranscribe) {
      if (allowed) return record()
      // Ya lo negó el sistema: la ficha del permiso no tiene nada que pedir.
      if (micWasDenied()) return deniedToast()
      return setAsking(true)
    }
    if (speechSupported()) return dictate()
    const text = pick(TEXT)
    // Cada motivo con su salida: activar los avisos, instalar la app, o desbloquearlos en el sistema.
    if (push.status === 'off') return toast({ message: text.enableReminders, actionLabel: text.enable, onAction: () => void push.enable() })
    if (push.status === 'needs-install') return toast({ message: text.install })
    if (push.status === 'denied') return toast({ message: text.blocked })
    toast({ message: text.unavailable })
  }, [allowed, deniedToast, dictate, phase, push, record, toast])

  /** Cerrar la ficha del permiso sin pedir nada (solo fuera del iPhone). */
  const dismiss = useCallback(() => setAsking(false), [])

  /** Si el micrófono tiene algún sitio adonde ir: sin servidor ni dictado del navegador, no se enseña. */
  const available = push.canTranscribe || speechSupported() || push.status === 'off' || push.status === 'needs-install' || push.status === 'denied'

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

  /** Ya se sabe adónde puede ir el dictado: antes, `start` podría decir que no hay avisos cuando sí los hay. */
  const ready = !push.restoring

  return { phase, level, partial, remaining, start, stop, cancel, asking, proceed, dismiss, available, ready }
}
