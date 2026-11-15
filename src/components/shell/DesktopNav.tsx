import { useCopy } from '../../state/LanguageProvider'
import type { TabId } from '../../types'
import { IconAgenda, IconMap, IconSliders } from '../ui/Icons'
import { useSync } from '../sync/SyncProvider'
import '../sync/sync.css'
import './desktop.css'

const COPY = {
  es: {
    nav: 'Secciones',
    board: 'Tu día',
    places: 'Lugares',
    settings: 'Ajustes',
    linked: 'Vinculado con tu iPhone',
    offline: 'Sin conexión con tus dispositivos',
    unlinked: 'Vincular con el iPhone',
    keys: 'N: nueva tarea',
  },
  en: {
    nav: 'Sections',
    board: 'Your day',
    places: 'Places',
    settings: 'Settings',
    linked: 'Linked with your iPhone',
    offline: 'Offline from your devices',
    unlinked: 'Link with your iPhone',
    keys: 'N: new task',
  },
} as const

interface DesktopNavProps {
  tab: TabId
  onChange: (tab: TabId) => void
  /** Abrir Ajustes → Dispositivos (vincular). */
  onLink: () => void
}

/**
 * Arriba en el escritorio, en lugar de la barra de pestañas: tu día (Bandeja, Agenda y cesta a la vez),
 * Lugares y Ajustes, y cómo va el vínculo con tus otros dispositivos.
 */
export function DesktopNav({ tab, onChange, onLink }: DesktopNavProps) {
  const copy = useCopy(COPY)
  const sync = useSync()
  const board = tab === 'inbox' || tab === 'agenda'
  const items: { id: TabId; label: string; Icon: typeof IconAgenda; active: boolean }[] = [
    { id: 'agenda', label: copy.board, Icon: IconAgenda, active: board },
    { id: 'places', label: copy.places, Icon: IconMap, active: tab === 'places' },
    { id: 'settings', label: copy.settings, Icon: IconSliders, active: tab === 'settings' },
  ]
  const status = !sync.link ? copy.unlinked : sync.status === 'online' ? copy.linked : copy.offline

  return (
    <header className="desk-nav">
      <span className="desk-nav__brand">Tasks</span>
      <nav className="desk-nav__tabs" aria-label={copy.nav}>
        {items.map(({ id, label, Icon, active }) => (
          <button key={id} type="button" className={`desk-nav__tab ${active ? 'is-active' : ''}`} aria-current={active ? 'page' : undefined} onClick={() => onChange(id)}>
            <Icon size={17} />
            {label}
          </button>
        ))}
      </nav>
      <span className="desk-nav__keys" aria-hidden="true">
        {copy.keys}
      </span>
      {sync.available && (
        <button type="button" className={`desk-nav__link link-status ${sync.status === 'online' ? 'is-online' : ''}`} onClick={onLink}>
          {status}
        </button>
      )}
    </header>
  )
}
