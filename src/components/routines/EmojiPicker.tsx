import { ROUTINE_EMOJIS, cleanEmoji } from '../../lib/emoji'
import { IconClose } from '../ui/Icons'
import './routines.css'

interface EmojiPickerProps {
  value: string | null
  onChange: (emoji: string | null) => void
}

/**
 * Los emojis de una rutina: una lámina con los de cada día, "sin emoji" y un hueco donde teclear
 * cualquier otro con el teclado de emojis. El que ya tiene, si no es de la lámina, va el primero.
 */
export function EmojiPicker({ value, onChange }: EmojiPickerProps) {
  const options = value && !ROUTINE_EMOJIS.includes(value) ? [value, ...ROUTINE_EMOJIS] : ROUTINE_EMOJIS

  return (
    <div className="emoji-picker" role="group" aria-label="Emoji de la rutina">
      <button
        type="button"
        className={`emoji-picker__cell emoji-picker__none ${value === null ? 'is-active' : ''}`}
        aria-pressed={value === null}
        aria-label="Sin emoji"
        onClick={() => onChange(null)}
      >
        <IconClose size={14} />
      </button>
      {options.map((emoji) => (
        <button
          key={emoji}
          type="button"
          className={`emoji-picker__cell ${emoji === value ? 'is-active' : ''}`}
          aria-pressed={emoji === value}
          aria-label={emoji}
          onClick={() => onChange(emoji)}
        >
          <span className="emoji" aria-hidden="true">
            {emoji}
          </span>
        </button>
      ))}
      {/* Siempre vacío: en cuanto llega un emoji se elige, y lo que no lo es no se queda escrito. */}
      <input
        className="emoji-picker__other"
        value=""
        placeholder="Otro"
        aria-label="Otro emoji"
        autoComplete="off"
        autoCorrect="off"
        onChange={(event) => {
          const emoji = cleanEmoji(event.target.value)
          if (emoji) onChange(emoji)
        }}
      />
    </div>
  )
}
