import type { ViewId } from '../../types'
import { IconToday, IconWeek } from '../ui/Icons'
import './shell.css'

const TABS: { id: ViewId; label: string; Icon: typeof IconToday }[] = [
  { id: 'home', label: 'Tareas', Icon: IconToday },
  { id: 'week', label: 'Semana', Icon: IconWeek },
]

interface BottomNavProps {
  view: ViewId
  onChange: (view: ViewId) => void
}

export function BottomNav({ view, onChange }: BottomNavProps) {
  return (
    <nav className="nav" aria-label="Vistas">
      {TABS.map(({ id, label, Icon }) => (
        <button
          key={id}
          type="button"
          className={`nav__tab ${view === id ? 'is-active' : ''}`}
          aria-current={view === id ? 'page' : undefined}
          onClick={() => onChange(id)}
        >
          <Icon size={19} />
          <span>{label}</span>
        </button>
      ))}
    </nav>
  )
}
