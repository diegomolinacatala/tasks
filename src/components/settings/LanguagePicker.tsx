import type { MouseEvent } from 'react'
import { deviceLanguages, resolveLanguage, systemLanguage } from '../../lib/i18n'
import { loadEnglish } from '../../lib/parse'
import { haptic } from '../../lib/platform/feedback'
import { withTransition } from '../../lib/transition'
import { useCopy } from '../../state/LanguageProvider'
import { useDispatch } from '../../state/StoreProvider'
import type { LanguageSetting } from '../../types'
import { IconCheck } from '../ui/Icons'

/** Cada idioma se nombra en sí mismo, como en los ajustes de iOS: quien no entiende uno encuentra el suyo. */
const NATIVE_NAMES = { es: 'Español', en: 'English' } as const

const COPY = { es: { title: 'Idioma', auto: 'Automático' }, en: { title: 'Language', auto: 'Automatic' } } as const

const OPTIONS: readonly LanguageSetting[] = ['auto', 'es', 'en']

/**
 * Idioma de la app: automático (el del sistema, que se nombra a la derecha), español o inglés. Lista
 * con una marca, como la de idiomas de iOS; al elegir, los textos cambian con un fundido.
 */
export function LanguagePicker({ value }: { value: LanguageSetting }) {
  const dispatch = useDispatch()
  const copy = useCopy(COPY)
  const system = NATIVE_NAMES[systemLanguage(deviceLanguages())]

  const choose = (language: LanguageSetting, event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault()
    if (language === value) return
    haptic('selection')
    const commit = () => withTransition(() => dispatch({ type: 'settings/language', language }))
    // El analizador en inglés llega antes que los textos: al cambiar, la barra ya entiende el idioma nuevo.
    if (resolveLanguage(language, deviceLanguages()) === 'en') void loadEnglish().then(commit, commit)
    else commit()
  }

  return (
    <section className="group">
      <h2 className="group__title">{copy.title}</h2>
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
    </section>
  )
}
