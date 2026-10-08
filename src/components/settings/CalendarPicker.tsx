import type { CSSProperties } from 'react'
import { calendarGroups, toggleHidden } from '../../lib/calendar'
import { haptic } from '../../lib/platform/feedback'
import { useCopy } from '../../state/LanguageProvider'
import { useAppState, useDispatch } from '../../state/StoreProvider'
import { useCalendar } from '../calendar/CalendarProvider'
import { IconCheck } from '../ui/Icons'
import { Sheet } from '../ui/Sheet'

const COPY = {
  es: {
    title: 'Calendarios',
    onDevice: 'En mi iPhone',
    note: 'Los que quites no salen en la Agenda ni en el widget. En el iPhone siguen igual.',
    shown: (name: string) => `${name}: se ve`,
    hidden: (name: string) => `${name}: oculto`,
  },
  en: {
    title: 'Calendars',
    onDevice: 'On My iPhone',
    note: 'The ones you turn off won’t show in the Agenda or the widget. They stay the same on your iPhone.',
    shown: (name: string) => `${name}: shown`,
    hidden: (name: string) => `${name}: hidden`,
  },
} as const

/** Qué calendarios se ven, agrupados por su cuenta como en la app Calendario: tocar uno lo quita o lo pone. */
export function CalendarPicker({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { calendars } = useCalendar()
  const hidden = useAppState().settings.calendar.hidden
  const dispatch = useDispatch()
  const copy = useCopy(COPY)

  return (
    <Sheet open={open} onClose={onClose} title={copy.title}>
      <h2 className="calpick__title">{copy.title}</h2>
      {calendarGroups(calendars).map((group) => (
        <div key={group.source} className="calpick__group">
          <p className="sheet__title">{group.source || copy.onDevice}</p>
          <div className="group__card">
            {group.calendars.map((calendar) => {
              const shown = !hidden.includes(calendar.id)
              return (
                <button
                  key={calendar.id}
                  type="button"
                  className={`group__row calpick__row ${shown ? 'is-shown' : ''}`}
                  aria-pressed={shown}
                  aria-label={shown ? copy.shown(calendar.title) : copy.hidden(calendar.title)}
                  onClick={() => {
                    haptic('selection')
                    dispatch({ type: 'settings/calendar', hidden: toggleHidden(hidden, calendar.id) })
                  }}
                >
                  <i className="calpick__dot cal-tone" style={{ '--cal': calendar.color } as CSSProperties} aria-hidden="true" />
                  <span className="group__label">{calendar.title}</span>
                  <span className="calpick__check" aria-hidden="true">
                    <IconCheck size={14} strokeWidth={2.6} />
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      ))}
      <p className="group__note">{copy.note}</p>
    </Sheet>
  )
}
