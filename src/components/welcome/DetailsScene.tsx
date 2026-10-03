import { useMemo, useState } from 'react'
import { addDays, relativeLabel, todayIso } from '../../lib/date'
import type { Details } from '../../lib/details'
import { addDetailReminder, detailsFrom, detailsSummary, removeDetailReminder, withDate, withDuration } from '../../lib/details'
import { parseTask } from '../../lib/parse'
import { haptic } from '../../lib/platform/feedback'
import { reminderLabel } from '../../lib/reminders'
import { useCopy } from '../../state/LanguageProvider'
import { IconArrowUp, IconBell, IconChevronDown, IconClose, IconPlus, IconSliders } from '../ui/Icons'
import { usePullUp } from '../compose/usePullUp'
import { DurationPicker } from '../task/DurationPicker'
import { reducedMotion } from './motion'
import '../compose/composer.css'
import '../compose/compose-sheet.css'
import '../ui/sheet.css'

/** Una cita con día y hora: al desplegar, cada cosa ya está en su sitio. */
const COPY = {
  es: {
    phrase: 'Cine con Carlota el viernes a las 21:30',
    explain: 'Al tocar Detalles, la frase se despliega en una ficha con su día, su hora, la duración y los avisos.',
    clear: 'Quitar los detalles',
    details: 'Detalles',
    card: 'Ficha de la tarea',
    fold: 'Plegar',
    newTask: 'Nueva tarea',
    inbox: 'Bandeja',
    when: 'Cuándo',
    reminders: 'Avisos',
  },
  en: {
    phrase: 'Movie with Carlota on Friday at 9:30pm',
    explain: 'Tapping Details unfolds the sentence into a card with its day, time, duration and reminders.',
    clear: 'Remove the details',
    details: 'Details',
    card: 'Task card',
    fold: 'Fold',
    newTask: 'New task',
    inbox: 'Inbox',
    when: 'When',
    reminders: 'Reminders',
  },
} as const
const EXTRA_REMINDER = { kind: 'before', minutes: 30 } as const

let ids = 0
const newId = () => `scene-${++ids}`

/**
 * La barra con una frase ya escrita y **Detalles** al lado, latiendo hasta que se toca (o se tira del
 * asa). Entonces sube la ficha, de verdad pero en pequeño: el día y los avisos se cambian con un toque
 * y la duración, con la regla. Plegarla deja en la barra lo decidido, como el mini reproductor dice qué suena.
 */
export function DetailsScene() {
  const copy = useCopy(COPY)
  const still = useMemo(reducedMotion, [])
  const today = useMemo(() => todayIso(), [])
  const parsed = useMemo(() => parseTask(copy.phrase, Date.now(), null), [copy.phrase])
  const [details, setDetails] = useState<Details | null>(null)
  const [open, setOpen] = useState(false)
  const [touched, setTouched] = useState(false)

  const expand = () => {
    haptic('selection')
    setTouched(true)
    setDetails((current) => current ?? detailsFrom(parsed, null, today, newId))
    setOpen(true)
  }
  const pull = usePullUp<HTMLDivElement>(expand)

  const fold = () => {
    haptic('selection')
    setOpen(false)
  }

  const change = (next: Details) => {
    haptic('selection')
    setDetails(next)
  }

  const days = [today, addDays(today, 1), ...(parsed.date && parsed.date > addDays(today, 1) ? [parsed.date] : [])]
  const summary = details ? detailsSummary(details, today, [], []) : []
  const extra = details?.reminders.find((reminder) => reminder.kind === 'before' && reminder.minutes === EXTRA_REMINDER.minutes)

  return (
    <div className={`scene scene--details ${!touched && !still ? 'is-hinting' : ''}`}>
      <p className="sr-only">{copy.explain}</p>

      <div ref={pull.card} className={`composer is-active has-tray scene__composer ${open ? 'is-expanded' : ''}`} inert={open}>
        <div className="composer__grab" {...pull.handlers}>
          <span />
        </div>
        <div className="composer__line">
          <span className="composer__mark" aria-hidden="true">
            <IconPlus size={15} />
          </span>
          <span className="scene__typed">
            <span>{details ? parsed.title : copy.phrase}</span>
          </span>
          <span className="composer__send" aria-hidden="true">
            <IconArrowUp size={17} strokeWidth={2.2} />
          </span>
        </div>
        <div className="composer__foot">
          <div className="composer__tray">
            {details ? (
              <>
                <button
                  type="button"
                  className="composer__clear"
                  aria-label={copy.clear}
                  onClick={() => {
                    haptic('selection')
                    setDetails(null)
                  }}
                >
                  <IconClose size={14} />
                </button>
                {summary.map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    className={`composer__target is-detail ${item.key === 'when' ? 'is-active' : ''}`}
                    onClick={expand}
                  >
                    {item.icon === 'bell' && <IconBell size={12} strokeWidth={2} />}
                    {item.label}
                  </button>
                ))}
              </>
            ) : (
              parsed.label && (
                <span className="composer__parsed">
                  <IconBell size={12} strokeWidth={2} />
                  {parsed.label}
                </span>
              )
            )}
          </div>
          <button type="button" className={`composer__more ${details ? 'has-details' : ''}`} aria-label={copy.details} onClick={expand}>
            <IconSliders size={15} />
            {!details && <span aria-hidden="true">{copy.details}</span>}
          </button>
        </div>
      </div>

      {details && (
        <div className={`scene__sheet ${open ? 'is-open' : ''}`} role="group" aria-label={copy.card} inert={!open}>
          <header className="compose-head">
            <button type="button" className="compose-head__fold" aria-label={copy.fold} onClick={fold}>
              <IconChevronDown size={20} />
            </button>
            <div className="compose-head__text">
              <p className="compose-head__kicker">{copy.newTask}</p>
              <p className="compose-head__where">{details.date ? relativeLabel(details.date, today) : copy.inbox}</p>
            </div>
          </header>
          <p className="scene__sheet-title">{parsed.title}</p>

          <p className="sheet__title">{copy.when}</p>
          <div className="sheet__chips">
            {days.map((day) => (
              <button
                key={day}
                type="button"
                className={`chip ${details.date === day ? 'is-active' : ''}`}
                onClick={() => change(withDate(details, day))}
              >
                {relativeLabel(day, today)}
              </button>
            ))}
          </div>

          {/* La regla de verdad: arrastrar, y mantener al final para estirarla. */}
          {details.time && (
            <DurationPicker time={details.time} duration={details.duration} onChange={(minutes) => setDetails(withDuration(details, minutes))} />
          )}

          <p className="sheet__title">{copy.reminders}</p>
          <div className="sheet__chips">
            {details.reminders.map((reminder) => (
              <button key={reminder.id} type="button" className="chip chip--reminder" onClick={() => change(removeDetailReminder(details, reminder.id))}>
                <IconBell size={13} />
                {reminderLabel(reminder, Date.now())}
                <IconClose size={12} className="chip__remove" />
              </button>
            ))}
            {!extra && details.time && (
              <button type="button" className="chip chip--option" onClick={() => change(addDetailReminder(details, EXTRA_REMINDER, newId()))}>
                {reminderLabel(EXTRA_REMINDER, Date.now())}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
