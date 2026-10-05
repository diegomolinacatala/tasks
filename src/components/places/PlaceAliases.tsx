import { useRef, useState } from 'react'
import { MAX_ALIASES, cleanAliases, cleanPlaceName, findPlace } from '../../lib/places'
import { haptic } from '../../lib/platform/feedback'
import { useCopy } from '../../state/LanguageProvider'
import { useAppState } from '../../state/StoreProvider'
import { IconClose } from '../ui/Icons'
import { useToast } from '../ui/Toast'

const COPY = {
  es: {
    title: 'Otros nombres',
    add: '+ Otro nombre',
    name: 'Nombre',
    remove: (alias: string) => `Quitar el nombre ${alias}`,
    taken: (alias: string, place: string) => `«${alias}» ya lo usa ${place}.`,
  },
  en: {
    title: 'Other names',
    add: '+ Another name',
    name: 'Name',
    remove: (alias: string) => `Remove the name ${alias}`,
    taken: (alias: string, place: string) => `“${alias}” is already used by ${place}.`,
  },
} as const

interface PlaceAliasesProps {
  /** El nombre del lugar: un otro nombre igual no se añade. */
  name: string
  aliases: string[]
  /** `null` = lugar nuevo. */
  placeId: string | null
  onChange: (aliases: string[]) => void
}

/**
 * Otras formas de llamar al lugar ("el piso", "casa de mis padres"): al escribir o dictar valen como su
 * nombre. Se añaden como las secciones, con una píldora que se convierte en campo, y se quitan con la ×.
 */
export function PlaceAliases({ name, aliases, placeId, onChange }: PlaceAliasesProps) {
  const { places } = useAppState()
  const toast = useToast()
  const copy = useCopy(COPY)
  const [draft, setDraft] = useState<string | null>(null)
  // Escape cierra el campo sin añadir lo escrito (el `blur` que llega después añadiría).
  const discard = useRef(false)
  const others = places.filter((place) => place.id !== placeId)

  const add = (raw: string) => {
    setDraft(null)
    const alias = cleanPlaceName(raw)
    if (!alias) return
    const taken = findPlace(others, alias)
    if (taken) {
      toast({ message: copy.taken(alias, taken.name) })
      return
    }
    const next = cleanAliases([...aliases, alias], name, others)
    if (next.length === aliases.length) return
    haptic('selection')
    onChange(next)
  }

  return (
    <>
      <p className="sheet__title">{copy.title}</p>
      <div className="sheet__chips">
        {aliases.map((alias) => (
          <button
            key={alias}
            type="button"
            className="chip chip--reminder"
            aria-label={copy.remove(alias)}
            onClick={() => onChange(aliases.filter((item) => item !== alias))}
          >
            {alias}
            <IconClose size={12} className="chip__remove" />
          </button>
        ))}
        {draft !== null ? (
          <input
            className="chip"
            autoFocus
            enterKeyHint="done"
            autoComplete="off"
            placeholder={copy.name}
            aria-label={copy.title}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onBlur={() => {
              if (discard.current) setDraft(null)
              else add(draft)
              discard.current = false
            }}
            onKeyDown={(event) => {
              if (event.key === 'Escape') discard.current = true
              if (event.key === 'Enter' || event.key === 'Escape') event.currentTarget.blur()
            }}
          />
        ) : (
          aliases.length < MAX_ALIASES && (
            <button type="button" className="chip chip--option" onClick={() => setDraft('')}>
              {copy.add}
            </button>
          )
        )}
      </div>
    </>
  )
}
