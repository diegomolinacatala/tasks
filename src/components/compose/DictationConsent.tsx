import { isNative } from '../../lib/platform'
import { Sheet } from '../ui/Sheet'
import './consent.css'

/** Qué sale del móvil al dictar, a quién y para qué. Se enseña antes de pedir el micrófono y en Ajustes. */
export const DICTATION_NOTICE =
  'Para convertir lo que dices en tareas, el audio se envía a nuestro servidor y lo procesan modelos de IA ' +
  'de Cloudflare (Workers AI). No se guarda ni se usa para nada más.' +
  (isNative ? ' Con Siri solo se envía el texto.' : '')

interface DictationConsentProps {
  open: boolean
  onContinue: () => void
}

/**
 * Adónde va la voz, antes de que el sistema pida el micrófono (App Store, normas 5.1.1 y 5.1.2).
 * Apple exige que un aviso previo lleve siempre a la petición del sistema: un solo botón,
 * "Continuar", y sin cerrarse de otra forma. Quien decide es el diálogo del micrófono.
 */
export function DictationConsent({ open, onContinue }: DictationConsentProps) {
  return (
    <Sheet open={open} title="Dictado">
      <p className="sheet__title">Dictado</p>
      <p className="consent__text">{DICTATION_NOTICE}</p>
      <div className="sheet__chips consent__actions">
        <button type="button" className="chip is-active" onClick={onContinue}>
          Continuar
        </button>
      </div>
    </Sheet>
  )
}
