import { useState } from 'react'
import { haptic } from '../../lib/platform/feedback'
import { useCopy } from '../../state/LanguageProvider'
import { useAppState, useDispatch } from '../../state/StoreProvider'
import { dictationNotice } from '../compose/DictationConsent'
import { usePush } from '../push/PushProvider'
import { IconMic } from '../ui/Icons'
import { Sheet } from '../ui/Sheet'
import { SettingsRow, SettingsSheetTitle } from './SettingsRow'
import { Switch } from './Switch'

const COPY = {
  es: { title: 'Dictado', ai: 'Dictado con IA', what: 'Qué se envía', on: 'Con IA', off: 'Sin IA' },
  en: { title: 'Dictation', ai: 'AI dictation', what: 'What gets sent', on: 'With AI', off: 'Without AI' },
} as const

/**
 * Ajustes → Dictado: una fila con si está el dictado con IA y, en su panel, el interruptor (el permiso,
 * como el resto de lo que es sí o no) y adónde va la voz, ya a la vista. Sin el permiso, el micrófono
 * vuelve a preguntar.
 */
export function DictationRow() {
  const push = usePush()
  const allowed = useAppState().settings.dictation
  const dispatch = useDispatch()
  const copy = useCopy(COPY)
  const [open, setOpen] = useState(false)

  if (!push.canTranscribe) return null

  return (
    <>
      <SettingsRow icon={<IconMic size={17} />} label={copy.title} value={allowed ? copy.on : copy.off} onClick={() => setOpen(true)} />
      <Sheet open={open} onClose={() => setOpen(false)} title={copy.title}>
        <SettingsSheetTitle>{copy.title}</SettingsSheetTitle>
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
        </div>
        <p className="sheet__title">{copy.what}</p>
        <p className="group__note settings-sheet__text">{dictationNotice()}</p>
      </Sheet>
    </>
  )
}
