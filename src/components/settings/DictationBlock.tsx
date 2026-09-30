import { useAppState, useDispatch } from '../../state/StoreProvider'
import { DICTATION_NOTICE } from '../compose/DictationConsent'
import { usePush } from '../push/PushProvider'

/** El permiso del dictado con IA, para leer adónde va la voz y retirarlo. Sin él, el micrófono pregunta. */
export function DictationBlock() {
  const push = usePush()
  const allowed = useAppState().settings.dictation
  const dispatch = useDispatch()

  if (!push.canTranscribe) return null

  return (
    <section className="group">
      <h2 className="group__title">Dictado</h2>
      <div className="segmented" role="radiogroup" aria-label="Dictado con IA">
        <button
          type="button"
          role="radio"
          aria-checked={!allowed}
          className={`segmented__option ${allowed ? '' : 'is-active'}`}
          onClick={() => dispatch({ type: 'settings/dictation', allowed: false })}
        >
          No enviar la voz
        </button>
        <button
          type="button"
          role="radio"
          aria-checked={allowed}
          className={`segmented__option ${allowed ? 'is-active' : ''}`}
          onClick={() => dispatch({ type: 'settings/dictation', allowed: true })}
        >
          Permitido
        </button>
      </div>
      <p className="group__note">{DICTATION_NOTICE}</p>
    </section>
  )
}
