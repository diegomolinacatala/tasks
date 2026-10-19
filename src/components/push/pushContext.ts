import { createContext, useContext } from 'react'
import type { Transcription } from '../../lib/push/api'

/**
 * `unconfigured`: build sin servidor de avisos.
 * `needs-install`: iPhone sin instalar en la pantalla de inicio.
 */
export type PushStatus = 'unconfigured' | 'unsupported' | 'needs-install' | 'denied' | 'off' | 'on'

/** Lo mismo en la PWA (Web Push) y en la app nativa (notificaciones locales). */
export interface PushContextValue {
  status: PushStatus
  /** Aún mirando si el dispositivo ya estaba dado de alta: hasta entonces `off` no dice nada. */
  restoring: boolean
  busy: boolean
  syncFailed: boolean
  /** Vuelve a programar (o subir) los avisos tras un fallo. */
  retry: () => void
  enable: () => Promise<void>
  /** PWA: da de baja el dispositivo. App nativa: abre los ajustes de iOS, que es quien manda. */
  disable: () => Promise<void>
  /** Si el dictado puede ir al servidor (Whisper + IA). Si no, se usa el del navegador. */
  canTranscribe: boolean
  transcribe: (audio: string, signal?: AbortSignal) => Promise<Transcription>
}

export const PushContext = createContext<PushContextValue | null>(null)

export function usePush(): PushContextValue {
  const value = useContext(PushContext)
  if (!value) throw new Error('usePush debe usarse dentro de <PushProvider>')
  return value
}
