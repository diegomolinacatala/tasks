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
    <>
      <p className="sheet__title">Dictado</p>
      <div className="sheet__chips">
        <button
          type="button"
          className={`chip ${allowed ? '' : 'is-active'}`}
          onClick={() => dispatch({ type: 'settings/dictation', allowed: false })}
        >
          No enviar la voz
        </button>
        <button
          type="button"
          className={`chip ${allowed ? 'is-active' : ''}`}
          onClick={() => dispatch({ type: 'settings/dictation', allowed: true })}
        >
          Permitido
        </button>
      </div>
      <p className="sheet__note">{DICTATION_NOTICE}</p>
    </>
  )
}
