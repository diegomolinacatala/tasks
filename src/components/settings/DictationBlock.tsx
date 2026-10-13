import { useState } from 'react'
import { haptic } from '../../lib/platform/feedback'
import { useCopy } from '../../state/LanguageProvider'
import { useAppState, useDispatch } from '../../state/StoreProvider'
import { dictationNotice } from '../compose/DictationConsent'
import { usePush } from '../push/PushProvider'
import { IconChevronDown, IconChevronRight, IconMic } from '../ui/Icons'
import { Switch } from './Switch'

const COPY = {
  es: { title: 'Dictado', ai: 'Dictado con IA', what: 'Qué se envía' },
  en: { title: 'Dictation', ai: 'AI dictation', what: 'What gets sent' },
} as const

/**
 * El permiso del dictado con IA: un interruptor, como el resto de lo que es sí o no en Ajustes, y el
 * texto de adónde va la voz plegado en una fila. Sin el permiso, el micrófono vuelve a preguntar.
 */
export function DictationBlock() {
  const push = usePush()
  const allowed = useAppState().settings.dictation
  const dispatch = useDispatch()
  const copy = useCopy(COPY)
  const [open, setOpen] = useState(false)

  if (!push.canTranscribe) return null

  return (
    <section className="group">
      <h2 className="group__title">{copy.title}</h2>
      <div className="group__card">
        <div className="group__row group__row--static">
          <IconMic size={18} />
          <span className="group__label">{copy.ai}</span>
          <Switch
            checked={allowed}
            label={copy.ai}
            onChange={(next) => {
              haptic('selection')
              dispatch({ type: 'settings/dictation', allowed: next })
            }}
          />
        </div>
        <button type="button" className="group__row" aria-expanded={open} onClick={() => setOpen((current) => !current)}>
          <span className="group__label">{copy.what}</span>
          {open ? <IconChevronDown size={16} className="group__chevron" /> : <IconChevronRight size={16} className="group__chevron" />}
        </button>
      </div>
      {open && <p className="group__note">{dictationNotice()}</p>}
    </section>
  )
}
