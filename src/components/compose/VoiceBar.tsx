import type { CSSProperties } from 'react'
import { useCopy } from '../../state/LanguageProvider'
import type { VoicePhase } from './useVoice'

interface VoiceBarProps {
  phase: VoicePhase
  level: number
  partial: string
}

/** Peso de cada barra: las centrales reaccionan más, como una onda. */
const BARS = [0.45, 0.75, 1, 0.75, 0.45]
/** Por debajo de este nivel no hay onda que enseñar (o el dictado no da nivel): respira. */
const QUIET_LEVEL = 0.05

const COPY = { es: { listening: 'Escuchando…', creating: 'Creando tarea…' }, en: { listening: 'Listening…', creating: 'Creating task…' } } as const

export function VoiceBar({ phase, level, partial }: VoiceBarProps) {
  const copy = useCopy(COPY)
  const listening = phase === 'listening'
  const text = listening ? partial || copy.listening : copy.creating

  return (
    <div className={`voice ${listening ? 'is-listening' : 'is-processing'} ${listening && level < QUIET_LEVEL ? 'is-quiet' : ''}`}>
      <span className="voice__wave" aria-hidden="true">
        {BARS.map((weight, index) => (
          <span
            key={index}
            className="voice__bar"
            style={{ '--voice-scale': listening ? 0.2 + level * weight * 0.8 : 0.35 } as CSSProperties}
          />
        ))}
      </span>
      <span className={`voice__text ${partial && listening ? 'is-partial' : ''}`}>{text}</span>
    </div>
  )
}
