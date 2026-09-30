import type { CSSProperties } from 'react'
import type { TabId } from '../../types'
import { IconAgenda, IconInbox, IconMap, IconSliders } from '../ui/Icons'
import './shell.css'

const TABS: { id: TabId; label: string; Icon: typeof IconInbox }[] = [
  { id: 'inbox', label: 'Bandeja', Icon: IconInbox },
  { id: 'agenda', label: 'Agenda', Icon: IconAgenda },
  { id: 'places', label: 'Lugares', Icon: IconMap },
  { id: 'settings', label: 'Ajustes', Icon: IconSliders },
]

interface TabBarProps {
  tab: TabId
  /** Hay algo atrasado: un punto en la Agenda. */
  overdue: boolean
  onChange: (tab: TabId) => void
  /** Tocar la pestaña en la que ya estás: vuelve arriba (y, en la Agenda, a hoy). */
  onReselect: (tab: TabId) => void
}

/** Barra inferior. Un filete de oro se desliza hasta la pestaña elegida. */
export function TabBar({ tab, overdue, onChange, onReselect }: TabBarProps) {
  const index = TABS.findIndex((item) => item.id === tab)

  return (
    <nav className="tabs" aria-label="Secciones" style={{ '--tab-index': index } as CSSProperties}>
      <span className="tabs__rule" aria-hidden="true" />
      {TABS.map(({ id, label, Icon }) => {
        const active = id === tab
        return (
          <button
            key={id}
            type="button"
            className={`tabs__tab ${active ? 'is-active' : ''}`}
            aria-current={active ? 'page' : undefined}
            onClick={() => (active ? onReselect(id) : onChange(id))}
          >
            <span className="tabs__icon">
              <Icon size={21} />
              {id === 'agenda' && overdue && <i className="tabs__dot" role="img" aria-label="Hay tareas atrasadas" />}
            </span>
            <span className="tabs__label">{label}</span>
          </button>
        )
      })}
    </nav>
  )
}
