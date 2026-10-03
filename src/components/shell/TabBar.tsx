import type { CSSProperties } from 'react'
import { useCopy } from '../../state/LanguageProvider'
import type { TabId } from '../../types'
import { IconAgenda, IconInbox, IconMap, IconSliders } from '../ui/Icons'
import './shell.css'

const TABS: { id: TabId; Icon: typeof IconInbox }[] = [
  { id: 'inbox', Icon: IconInbox },
  { id: 'agenda', Icon: IconAgenda },
  { id: 'places', Icon: IconMap },
  { id: 'settings', Icon: IconSliders },
]

const COPY = {
  es: {
    tabs: { inbox: 'Bandeja', agenda: 'Agenda', places: 'Lugares', settings: 'Ajustes' },
    nav: 'Secciones',
    overdue: 'Hay tareas atrasadas',
  },
  en: {
    tabs: { inbox: 'Inbox', agenda: 'Agenda', places: 'Places', settings: 'Settings' },
    nav: 'Sections',
    overdue: 'There are overdue tasks',
  },
} as const

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
  const copy = useCopy(COPY)

  return (
    <nav className="tabs" aria-label={copy.nav} style={{ '--tab-index': index } as CSSProperties}>
      <span className="tabs__rule" aria-hidden="true" />
      {TABS.map(({ id, Icon }) => {
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
              {id === 'agenda' && overdue && <i className="tabs__dot" role="img" aria-label={copy.overdue} />}
            </span>
            <span className="tabs__label">{copy.tabs[id]}</span>
          </button>
        )
      })}
    </nav>
  )
}
