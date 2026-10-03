import { useCopy } from '../../state/LanguageProvider'
import { useAppState, useDispatch } from '../../state/StoreProvider'
import { dictationNotice } from '../compose/DictationConsent'
import { usePush } from '../push/PushProvider'

const COPY = {
  es: { title: 'Dictado', group: 'Dictado con IA', off: 'No enviar la voz', on: 'Permitido' },
  en: { title: 'Dictation', group: 'AI dictation', off: 'Don’t send my voice', on: 'Allowed' },
} as const

/** El permiso del dictado con IA, para leer adónde va la voz y retirarlo. Sin él, el micrófono pregunta. */
export function DictationBlock() {
  const push = usePush()
  const allowed = useAppState().settings.dictation
  const dispatch = useDispatch()
  const copy = useCopy(COPY)

  if (!push.canTranscribe) return null

  return (
    <section className="group">
      <h2 className="group__title">{copy.title}</h2>
      <div className="segmented" role="radiogroup" aria-label={copy.group}>
        <button
          type="button"
          role="radio"
          aria-checked={!allowed}
          className={`segmented__option ${allowed ? '' : 'is-active'}`}
          onClick={() => dispatch({ type: 'settings/dictation', allowed: false })}
        >
          {copy.off}
        </button>
        <button
          type="button"
          role="radio"
          aria-checked={allowed}
          className={`segmented__option ${allowed ? 'is-active' : ''}`}
          onClick={() => dispatch({ type: 'settings/dictation', allowed: true })}
        >
          {copy.on}
        </button>
      </div>
      <p className="group__note">{dictationNotice()}</p>
    </section>
  )
}
