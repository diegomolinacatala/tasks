import type { MouseEvent } from 'react'
import { switchTheme } from '../../lib/theme'
import { useDispatch } from '../../state/StoreProvider'
import type { Theme } from '../../types'
import { IconCheck } from '../ui/Icons'

const OPTIONS: { theme: Theme; label: string }[] = [
  { theme: 'light', label: 'Claro' },
  { theme: 'dark', label: 'Oscuro' },
  { theme: 'auto', label: 'Automático' },
]

/**
 * Tres tarjetas en miniatura (papel, noche y mitad y mitad), como el ajuste de pantalla de iOS. Al
 * elegir, el tema nuevo se extiende en círculo desde el dedo.
 */
export function AppearancePicker({ value }: { value: Theme }) {
  const dispatch = useDispatch()

  const choose = (theme: Theme, event: MouseEvent<HTMLButtonElement>) => {
    if (theme === value) return
    const origin = event.detail ? { x: event.clientX, y: event.clientY } : undefined
    switchTheme(theme, () => dispatch({ type: 'settings/theme', theme }), origin)
  }

  return (
    <div className="appearance" role="radiogroup" aria-label="Apariencia">
      {OPTIONS.map(({ theme, label }) => (
        <button
          key={theme}
          type="button"
          role="radio"
          aria-checked={value === theme}
          className={`appearance__option ${value === theme ? 'is-active' : ''}`}
          onClick={(event) => choose(theme, event)}
        >
          <span className={`appearance__card appearance__card--${theme}`} aria-hidden="true">
            <span className="appearance__half appearance__half--light">
              <i className="appearance__line appearance__line--title" />
              <i className="appearance__line" />
              <i className="appearance__line appearance__line--short" />
            </span>
            <span className="appearance__half appearance__half--dark">
              <i className="appearance__line appearance__line--title" />
              <i className="appearance__line" />
              <i className="appearance__line appearance__line--short" />
            </span>
          </span>
          <span className="appearance__label">{label}</span>
          <span className="appearance__check" aria-hidden="true">
            <IconCheck size={11} strokeWidth={2.8} />
          </span>
        </button>
      ))}
    </div>
  )
}
