import { MAX_MESSAGE } from '../../lib/feedback'
import { useCopy } from '../../state/LanguageProvider'
import { IconClose, IconFeather } from '../ui/Icons'
import { Sheet } from '../ui/Sheet'

const COPY = {
  es: {
    title: 'Sugerencia',
    placeholder: '¿Qué cambiarías, o qué no va bien?',
    send: 'Enviar',
    sending: 'Enviando…',
    redraw: 'Rodear otra vez',
    removeShot: 'No adjuntar la captura',
    addShot: 'Adjuntar la captura',
    noShot: 'Sin captura: solo dónde estabas.',
    whole: 'Toda la pantalla',
  },
  en: {
    title: 'Suggestion',
    placeholder: 'What would you change, or what isn’t working?',
    send: 'Send',
    sending: 'Sending…',
    redraw: 'Circle again',
    removeShot: 'Don’t attach the screenshot',
    addShot: 'Attach the screenshot',
    noShot: 'No screenshot: just where you were.',
    whole: 'The whole screen',
  },
} as const

interface FeedbackSheetProps {
  open: boolean
  /** La captura con lo rodeado, lista para enviar; `null` en la web o si aún se está haciendo. */
  preview: string | null
  /** Hay captura que adjuntar (aunque se haya quitado). */
  hasShot: boolean
  withShot: boolean
  /** Dónde estaba ("Agenda · Cena con Carlota") y qué se rodeó, para que se vea a qué se refiere. */
  where: string
  picked: string | null
  message: string
  sending: boolean
  /** Hay que esperar a que la foto con el trazo esté lista antes de poder enviar. */
  waiting: boolean
  /** Por qué no se pudo enviar, a la vista (un aviso suelto quedaría debajo del panel). */
  error: string | null
  onMessage: (message: string) => void
  onToggleShot: () => void
  onRedraw: () => void
  onClose: () => void
  onSend: () => void
}

/** El mensaje, con la captura y lo rodeado a la vista: quien escribe ve exactamente qué se manda. */
export function FeedbackSheet(props: FeedbackSheetProps) {
  const { open, preview, hasShot, withShot, where, picked, message, sending, waiting, error } = props
  const copy = useCopy(COPY)
  const ready = message.trim().length > 0 && !sending && !waiting

  return (
    <Sheet
      open={open}
      className="fb-sheet"
      title={copy.title}
      onClose={props.onClose}
      footer={
        <button type="button" className="sheet__primary" disabled={!ready} onClick={props.onSend}>
          {sending ? copy.sending : copy.send}
        </button>
      }
    >
      <p className="sheet__title">{copy.title}</p>
      <div className="fb-sheet__about">
        {hasShot && withShot && (
          <figure className="fb-thumb">
            {preview ? <img src={preview} alt="" /> : <span className="fb-thumb__wait" />}
            <button type="button" className="fb-thumb__remove" aria-label={copy.removeShot} onClick={props.onToggleShot}>
              <IconClose size={14} />
            </button>
          </figure>
        )}
        <div className="fb-sheet__meta">
          <p className="fb-sheet__where">{where}</p>
          <p className="fb-sheet__picked">{picked ?? copy.whole}</p>
          {hasShot && !withShot && <p className="sheet__note">{copy.noShot}</p>}
          <div className="sheet__chips">
            <button type="button" className="chip chip--option" onClick={props.onRedraw}>
              <IconFeather size={15} />
              {copy.redraw}
            </button>
            {hasShot && !withShot && (
              <button type="button" className="chip chip--option" onClick={props.onToggleShot}>
                {copy.addShot}
              </button>
            )}
          </div>
        </div>
      </div>
      <textarea
        className="fb-sheet__message"
        value={message}
        maxLength={MAX_MESSAGE}
        rows={5}
        placeholder={copy.placeholder}
        autoFocus
        onChange={(event) => props.onMessage(event.target.value)}
      />
      {error && (
        <p className="fb-sheet__error" role="alert">
          {error}
        </p>
      )}
    </Sheet>
  )
}
