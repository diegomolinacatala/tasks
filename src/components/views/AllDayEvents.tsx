import { useState } from 'react'
import type { CSSProperties } from 'react'
import type { CalendarEvent } from '../../lib/calendar'
import { useCopy } from '../../state/LanguageProvider'
import { useCalendar } from '../calendar/CalendarProvider'

/** Los que se ven sin desplegar: más serían una pared encima del día. */
const SHOWN = 2

const COPY = {
  es: {
    label: 'Todo el día',
    more: (count: number) => `+${count}`,
    moreLabel: (count: number) => `${count} más de todo el día`,
    untitled: 'Evento',
    open: (title: string) => `${title}, todo el día. Abrir en Calendario`,
  },
  en: {
    label: 'All day',
    more: (count: number) => `+${count}`,
    moreLabel: (count: number) => `${count} more all-day`,
    untitled: 'Event',
    open: (title: string) => `${title}, all day. Open in Calendar`,
  },
} as const

/**
 * Lo de todo el día del calendario (un cumpleaños, un festivo, un viaje): una línea de cintas encima del
 * día, cada una con el color de su calendario. Con muchas, las dos primeras y "+3" para ver el resto.
 */
export function AllDayEvents({ events }: { events: readonly CalendarEvent[] }) {
  const copy = useCopy(COPY)
  const { open } = useCalendar()
  const [expanded, setExpanded] = useState(false)
  if (!events.length) return null
  const shown = expanded || events.length <= SHOWN + 1 ? events : events.slice(0, SHOWN)
  const rest = events.length - shown.length

  return (
    <ul className="allday" aria-label={copy.label}>
      {shown.map((event) => (
        <li key={event.key}>
          <button
            type="button"
            className="allday__item cal-tone"
            style={{ '--cal': event.color } as CSSProperties}
            aria-label={copy.open(event.title || copy.untitled)}
            onClick={() => open(event)}
          >
            <i className="allday__mark" aria-hidden="true" />
            <span className="allday__title">{event.title || copy.untitled}</span>
          </button>
        </li>
      ))}
      {rest > 0 && (
        <li>
          <button type="button" className="allday__item allday__item--more" aria-label={copy.moreLabel(rest)} onClick={() => setExpanded(true)}>
            {copy.more(rest)}
          </button>
        </li>
      )}
    </ul>
  )
}
