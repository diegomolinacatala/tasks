import { useState } from 'react'
import type { MouseEvent } from 'react'
import { deviceLanguages, resolveLanguage, systemLanguage } from '../../lib/i18n'
import { loadEnglish } from '../../lib/parse'
import { haptic } from '../../lib/platform/feedback'
import { withTransition } from '../../lib/transition'
import { useCopy } from '../../state/LanguageProvider'
import { useDispatch } from '../../state/StoreProvider'
import type { LanguageSetting } from '../../types'
import { IconCheck, IconChevronRight } from '../ui/Icons'
import { Sheet } from '../ui/Sheet'

/** Cada idioma se nombra en sí mismo, como en los ajustes de iOS: quien no entiende uno encuentra el suyo. */
const NATIVE_NAMES = { es: 'Español', en: 'English' } as const

const COPY = { es: { title: 'Idioma', auto: 'Automático' }, en: { title: 'Language', auto: 'Automatic' } } as const

const OPTIONS: readonly LanguageSetting[] = ['auto', 'es', 'en']

/**
 * Idioma de la app: automático (el del sistema, que se nombra al lado), español o inglés. Una fila con
 * el valor que abre la lista en un panel, como el resto de Ajustes; al elegir, los textos cambian con
 * un fundido.
 */
export function LanguagePicker({ value }: { value: LanguageSetting }) {
  const dispatch = useDispatch()
  const copy = useCopy(COPY)
  const [open, setOpen] = useState(false)
  const system = NATIVE_NAMES[systemLanguage(deviceLanguages())]
  const current = value === 'auto' ? `${copy.auto} (${system})` : NATIVE_NAMES[value]

  const choose = (language: LanguageSetting, event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault()
    if (language === value) return setOpen(false)
    haptic('selection')
    const commit = () =>
      withTransition(() => {
        dispatch({ type: 'settings/language', language })
        setOpen(false)
      })
    // El analizador en inglés llega antes que los textos: al cambiar, la barra ya entiende el idioma nuevo.
    if (resolveLanguage(language, deviceLanguages()) === 'en') void loadEnglish().then(commit, commit)
    else commit()
  }

  return (
    <section className="group">
      <h2 className="group__title">{copy.title}</h2>
      <div className="group__card">
        <button type="button" className="group__row" onClick={() => setOpen(true)}>
          <span className="group__label">{copy.title}</span>
          <span className="group__value">{current}</span>
          <IconChevronRight size={16} className="group__chevron" />
        </button>
      </div>

      <Sheet open={open} onClose={() => setOpen(false)} title={copy.title}>
        <p className="sheet__title">{copy.title}</p>
        <div className="group__card" role="radiogroup" aria-label={copy.title}>
          {OPTIONS.map((option) => {
            const active = option === value
            return (
              <button
                key={option}
                type="button"
                role="radio"
                aria-checked={active}
                lang={option === 'auto' ? undefined : option}
                className={`group__row language__option ${active ? 'is-active' : ''}`}
                onClick={(event) => choose(option, event)}
              >
                <span className="group__label">{option === 'auto' ? copy.auto : NATIVE_NAMES[option]}</span>
                {option === 'auto' && <span className="group__value">{system}</span>}
                <span className="language__check" aria-hidden="true">
                  <IconCheck size={15} strokeWidth={2.4} />
                </span>
              </button>
            )
          })}
        </div>
      </Sheet>
    </section>
  )
}
