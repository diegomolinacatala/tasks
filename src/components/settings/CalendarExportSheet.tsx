import { useState } from 'react'
import type { CSSProperties } from 'react'
import { calendarGroups } from '../../lib/calendar'
import { haptic } from '../../lib/platform/feedback'
import { useCopy } from '../../state/LanguageProvider'
import { useAppState, useDispatch } from '../../state/StoreProvider'
import { useCalendar } from '../calendar/CalendarProvider'
import { IconCheck } from '../ui/Icons'
import { Sheet } from '../ui/Sheet'
import { useToast } from '../ui/Toast'

const COPY = {
  es: {
    title: 'Tus tareas en el calendario',
    lead: 'Las tareas con día y hora se añaden como eventos y se quitan al tacharlas. Si eliges uno compartido, como el del trabajo, quien lo comparta las verá.',
    none: 'No añadirlas',
    own: 'Calendario «Tasks»',
    ownName: 'Tasks',
    ownNote: 'Uno solo para tus tareas, aparte de los tuyos.',
    recommended: 'Recomendado',
    others: 'O en uno tuyo',
    onDevice: 'En mi iPhone',
    note: 'Lo que cambies en Tasks se cambia en el calendario; lo que cambies allí, no vuelve a Tasks.',
    failed: 'No se pudo crear el calendario «Tasks». Elige uno tuyo.',
  },
  en: {
    title: 'Your tasks in your calendar',
    lead: 'Tasks with a day and time are added as events and removed when you check them off. Pick a shared one, like your work calendar, and whoever shares it will see them.',
    none: 'Don’t add them',
    own: '“Tasks” calendar',
    ownName: 'Tasks',
    ownNote: 'One just for your tasks, apart from yours.',
    recommended: 'Recommended',
    others: 'Or in one of yours',
    onDevice: 'On My iPhone',
    note: 'What you change in Tasks changes in the calendar; what you change there doesn’t come back to Tasks.',
    failed: 'The “Tasks” calendar couldn’t be created. Pick one of yours.',
  },
} as const

/** Dónde se añaden las tareas con hora: en ninguno, en el «Tasks» propio (lo recomendado) o en uno que se pueda escribir. */
export function CalendarExportSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const copy = useCopy(COPY)
  const { calendars, source } = useCalendar()
  const current = useAppState().settings.calendar.export
  const dispatch = useDispatch()
  const toast = useToast()
  const [busy, setBusy] = useState(false)
  const own = calendars.find((calendar) => calendar.own)
  const writable = calendars.filter((calendar) => calendar.writable && !calendar.own)

  const choose = (id: string | null) => {
    haptic('selection')
    dispatch({ type: 'settings/calendar', export: id })
  }

  const chooseOwn = async () => {
    if (own) return choose(own.id)
    if (!source || busy) return
    setBusy(true)
    const id = await source.createOwn(copy.ownName).catch(() => null)
    setBusy(false)
    if (id) choose(id)
    else toast({ message: copy.failed })
  }

  const option = (key: string, selected: boolean, onPick: () => void, label: string, color: string | null, hint?: string) => (
    <button key={key} type="button" role="radio" aria-checked={selected} className={`group__row calpick__row ${selected ? 'is-shown' : ''}`} onClick={onPick}>
      {color ? (
        <i className="calpick__dot cal-tone" style={{ '--cal': color } as CSSProperties} aria-hidden="true" />
      ) : (
        <i className="calpick__dot calpick__dot--none" aria-hidden="true" />
      )}
      <span className="group__label">
        {label}
        {hint && <small className="calexport__hint">{hint}</small>}
      </span>
      <span className="calpick__check" aria-hidden="true">
        <IconCheck size={14} strokeWidth={2.6} />
      </span>
    </button>
  )

  return (
    <Sheet open={open} onClose={onClose} title={copy.title}>
      <h2 className="calpick__title">{copy.title}</h2>
      <p className="calguide__lead">{copy.lead}</p>
      <div className="group__card calexport__main" role="radiogroup" aria-label={copy.title}>
        {option('none', current === null, () => choose(null), copy.none, null)}
        {option('own', own !== undefined && current === own.id, () => void chooseOwn(), copy.own, '#8a5a2c', `${copy.recommended} · ${copy.ownNote}`)}
      </div>
      {writable.length > 0 && <p className="sheet__title">{copy.others}</p>}
      {calendarGroups(writable).map((group) => (
        <div key={group.source} className="calpick__group">
          <p className="calexport__source">{group.source || copy.onDevice}</p>
          <div className="group__card" role="radiogroup" aria-label={group.source || copy.onDevice}>
            {group.calendars.map((calendar) => option(calendar.id, current === calendar.id, () => choose(calendar.id), calendar.title, calendar.color))}
          </div>
        </div>
      ))}
      <p className="group__note">{copy.note}</p>
    </Sheet>
  )
}
