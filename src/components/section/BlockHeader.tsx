import type { ReactNode } from 'react'
import { IconChevronDown } from '../ui/Icons'
import './section.css'

interface BlockHeaderProps {
  label: string
  count?: number
  tone?: 'default' | 'danger'
  collapsed?: boolean
  onToggle?: () => void
  action?: ReactNode
}

/** Cabecera de los bloques fijos: Atrasadas, Hoy, Sin fecha. */
export function BlockHeader({ label, count, tone = 'default', collapsed, onToggle, action }: BlockHeaderProps) {
  const content = (
    <>
      <span className="section__chevron" aria-hidden="true">
        {onToggle ? <IconChevronDown size={16} /> : null}
      </span>
      <span className="section__name">{label}</span>
      {count ? <span className="section__count">{count}</span> : null}
    </>
  )

  return (
    <header className={`section__head section__head--block ${tone === 'danger' ? 'is-danger' : ''} ${collapsed ? 'is-collapsed' : ''}`}>
      {onToggle ? (
        <button type="button" className="section__toggle" aria-expanded={!collapsed} onClick={onToggle}>
          {content}
        </button>
      ) : (
        <div className="section__toggle">{content}</div>
      )}
      {action}
    </header>
  )
}
