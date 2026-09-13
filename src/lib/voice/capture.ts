import { mergeChunks, rms } from './wav'

/** Por encima de este nivel se considera que hay voz. */
const SPEECH_LEVEL = 0.02
/** Silencio tras hablar que da la frase por terminada. */
const SILENCE_MS = 1500
/** Si en este tiempo no se oye nada, se abandona. */
const NO_SPEECH_MS = 8000
const MAX_MS = 30_000
const BUFFER_SIZE = 4096

export type CaptureResult =
  | { status: 'ok'; samples: Float32Array; sampleRate: number }
  | { status: 'cancelled' }
  | { status: 'silent' }

export interface Capture {
  /** Termina y entrega lo grabado. */
  stop: () => void
  cancel: () => void
  result: Promise<CaptureResult>
}

type AudioContextConstructor = typeof AudioContext

/**
 * Debe llamarse dentro del gesto del usuario: iOS solo deja arrancar audio así.
 * Por eso se separa de `startCapture`, que ya es asíncrona.
 */
export function createAudioContext(): AudioContext {
  const scope = window as Window & { webkitAudioContext?: AudioContextConstructor }
  const Constructor = window.AudioContext ?? scope.webkitAudioContext
  if (!Constructor) throw new Error('Este navegador no permite grabar audio.')
  return new Constructor()
}

/**
 * Graba PCM directamente con un ScriptProcessor: funciona igual en Safari, Chrome y la app
 * instalada de iOS, sin depender de los códecs de MediaRecorder.
 */
export async function startCapture(context: AudioContext, onLevel: (level: number) => void): Promise<Capture> {
  let stream: MediaStream
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    })
  } catch (error) {
    void context.close()
    throw error
  }
  await context.resume()

  const source = context.createMediaStreamSource(stream)
  const processor = context.createScriptProcessor(BUFFER_SIZE, 1, 1)
  // El procesador tiene que estar conectado a la salida para funcionar, pero sin sonar.
  const mute = context.createGain()
  mute.gain.value = 0

  const chunks: Float32Array[] = []
  const startedAt = performance.now()
  let lastVoiceAt = startedAt
  let heard = false
  let settle: (result: CaptureResult) => void = () => undefined
  const result = new Promise<CaptureResult>((resolve) => {
    settle = resolve
  })

  let finished = false
  const finish = (outcome: 'keep' | 'cancel' | 'auto') => {
    if (finished) return
    finished = true
    processor.onaudioprocess = null
    processor.disconnect()
    source.disconnect()
    mute.disconnect()
    stream.getTracks().forEach((track) => track.stop())
    void context.close()
    onLevel(0)

    if (outcome === 'cancel') settle({ status: 'cancelled' })
    else if (!heard && outcome === 'auto') settle({ status: 'silent' })
    else if (!chunks.length) settle({ status: 'silent' })
    else settle({ status: 'ok', samples: mergeChunks(chunks), sampleRate: context.sampleRate })
  }

  processor.onaudioprocess = (event) => {
    const data = event.inputBuffer.getChannelData(0)
    chunks.push(new Float32Array(data))
    const level = rms(data)
    onLevel(Math.min(1, level * 10))

    const now = performance.now()
    if (level > SPEECH_LEVEL) {
      heard = true
      lastVoiceAt = now
    }
    if (heard && now - lastVoiceAt > SILENCE_MS) finish('auto')
    else if (!heard && now - startedAt > NO_SPEECH_MS) finish('auto')
    else if (now - startedAt > MAX_MS) finish('auto')
  }

  source.connect(processor)
  processor.connect(mute)
  mute.connect(context.destination)

  return { stop: () => finish('keep'), cancel: () => finish('cancel'), result }
}
