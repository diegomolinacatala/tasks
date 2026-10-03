import { pick } from '../../lib/i18n'
import { isNative } from '../../lib/platform'
import { useCopy } from '../../state/LanguageProvider'
import { Sheet } from '../ui/Sheet'
import './consent.css'

/** Qué sale del móvil al dictar, a quién y para qué. Se enseña antes de pedir el micrófono y en Ajustes. */
export const dictationNotice = (): string =>
  pick({
    es:
      'Para convertir lo que dices en tareas, el audio se envía a nuestro servidor y lo procesan modelos de IA ' +
      'de Cloudflare (Workers AI). No se guarda ni se usa para nada más.' +
      (isNative ? ' Con Siri solo se envía el texto.' : ''),
    en:
      'To turn what you say into tasks, the audio is sent to our server and processed by Cloudflare AI models ' +
      '(Workers AI). It is not stored or used for anything else.' +
      (isNative ? ' With Siri, only the text is sent.' : ''),
  })

const COPY = { es: { title: 'Dictado', next: 'Continuar' }, en: { title: 'Dictation', next: 'Continue' } } as const

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
  const copy = useCopy(COPY)
  return (
    <Sheet open={open} title={copy.title}>
      <p className="sheet__title">{copy.title}</p>
      <p className="consent__text">{dictationNotice()}</p>
      <div className="sheet__chips consent__actions">
        <button type="button" className="chip is-active" onClick={onContinue}>
          {copy.next}
        </button>
      </div>
    </Sheet>
  )
}
