import type { ReactNode } from 'react'
import { IconArrowUpRight, IconChevronRight } from '../ui/Icons'

interface SettingsRowProps {
  /** El icono, en su sello de color: así se encuentra cada cosa de un vistazo. */
  icon: ReactNode
  label: string
  /** Una segunda línea, más pequeña, cuando la fila necesita decir algo más (en lugar de una nota debajo). */
  hint?: string
  /** El valor de ahora ("Claro", "Resumen a las 8:00"): se ve sin abrir nada. */
  value?: ReactNode
  /** El valor dice que algo va mal (bloqueado, sin permiso). */
  danger?: boolean
  /** Lleva fuera de la app (una web, la App Store): flecha de salir en lugar de ›. */
  href?: string
  onClick?: () => void
  disabled?: boolean
}

/**
 * Una fila de Ajustes, como las de iOS: el sello con su icono, lo que es, su valor y adónde lleva. Todo lo
 * que se puede cambiar abre su panel; lo que lleva fuera, se abre en el navegador.
 */
export function SettingsRow({ icon, label, hint, value, danger = false, href, onClick, disabled }: SettingsRowProps) {
  const content = (
    <>
      <span className={`settings-row__icon ${danger ? 'is-danger' : ''}`} aria-hidden="true">
        {icon}
      </span>
      <span className="group__label settings-row__text">
        <span>{label}</span>
        {hint && <small className="settings-row__hint">{hint}</small>}
      </span>
      {value !== undefined && value !== null && value !== '' && (
        <span className={`group__value settings-row__value ${danger ? 'group__value--danger' : ''}`}>{value}</span>
      )}
      {href ? <IconArrowUpRight size={16} className="group__chevron" /> : <IconChevronRight size={16} className="group__chevron" />}
    </>
  )
  if (href) {
    return (
      <a className="group__row settings-row" href={href} target="_blank" rel="noopener noreferrer">
        {content}
      </a>
    )
  }
  return (
    <button type="button" className="group__row settings-row" disabled={disabled} onClick={onClick}>
      {content}
    </button>
  )
}

/** El título de un panel de Ajustes, en serif como el resto de títulos de panel. */
export function SettingsSheetTitle({ children }: { children: ReactNode }) {
  return <h2 className="settings-sheet__title">{children}</h2>
}
