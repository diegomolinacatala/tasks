import { isNative } from '../../lib/platform'
import { Sheet } from '../ui/Sheet'
import './consent.css'

/** Qué sale del móvil al dictar, a quién y para qué. Se enseña al pedir permiso y en Ajustes. */
export const DICTATION_NOTICE =
  'Para convertir lo que dices en tareas, el audio se envía a nuestro servidor y lo procesan modelos de IA ' +
  'de Cloudflare (Workers AI). No se guarda ni se usa para nada más.' +
  (isNative ? ' Con Siri solo se envía el texto.' : '')

interface DictationConsentProps {
  open: boolean
  onAllow: () => void
  onClose: () => void
}

/**
 * Antes de mandar nada a la IA del servidor, el permiso explícito (App Store, norma 5.1.2).
 * Se pide una vez; sin él, el micrófono no graba y Siri usa el analizador local.
 */
export function DictationConsent({ open, onAllow, onClose }: DictationConsentProps) {
  return (
    <Sheet open={open} onClose={onClose} title="Dictado">
      <p className="sheet__title">Dictado</p>
      <p className="consent__text">{DICTATION_NOTICE}</p>
      <div className="sheet__chips consent__actions">
        <button type="button" className="chip" onClick={onClose}>
          Ahora no
        </button>
        <button type="button" className="chip is-active" onClick={onAllow}>
          Permitir
        </button>
      </div>
    </Sheet>
  )
}
