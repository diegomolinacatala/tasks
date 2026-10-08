import { useState } from 'react'
import { isNative } from '../../lib/platform'
import { haptic } from '../../lib/platform/feedback'
import { useCopy } from '../../state/LanguageProvider'
import { IconCalendar, IconCheck, IconChevronRight } from '../ui/Icons'
import { Sheet } from '../ui/Sheet'

type Provider = 'google' | 'outlook' | 'other'

/** Un trozo de texto; los nombres de lo que hay que tocar, en negrita. */
type Line = readonly (string | { b: string })[]

interface Step {
  text: Line
  /** Cómo se ve en el iPhone lo que hay que tocar. */
  mock?: 'accounts' | 'toggle'
}

const ACCOUNTS = ['iCloud', 'Microsoft Exchange', 'Google', 'Yahoo!', 'AOL', 'Outlook.com'] as const

const COPY = {
  es: {
    sheet: 'Añadir un calendario',
    kicker: 'Calendario',
    title: 'Trae tu Google u Outlook',
    lead: 'Tasks enseña lo que tiene la app Calendario del iPhone. iCloud ya está; Google u Outlook se añaden una sola vez, en Ajustes.',
    tabs: { google: 'Google', outlook: 'Outlook', other: 'Otro' },
    tabsLabel: '¿Qué calendario usas?',
    path: ['Apps', 'Calendario', 'Cuentas de calendario', 'Añadir cuenta'],
    pathLabel: 'Ruta en Ajustes',
    go: [{ b: 'Abre Ajustes' }, ' y ve tocando:'] as Line,
    other: 'Otra',
    calendars: 'Calendarios',
    steps: {
      google: [
        { text: ['Elige ', { b: 'Google' }, ' e inicia sesión con tu cuenta de Gmail.'], mock: 'accounts' },
        { text: ['Deja ', { b: 'Calendarios' }, ' activado y toca ', { b: 'Guardar' }, '.'], mock: 'toggle' },
      ],
      outlook: [
        {
          text: ['Elige ', { b: 'Microsoft Exchange' }, ' si es del trabajo o de clase, u ', { b: 'Outlook.com' }, ' si es personal (@outlook, @hotmail). Inicia sesión.'],
          mock: 'accounts',
        },
        { text: ['Deja ', { b: 'Calendarios' }, ' activado y toca ', { b: 'Guardar' }, '.'], mock: 'toggle' },
      ],
      other: [
        {
          text: ['Elige el tuyo (', { b: 'Yahoo!' }, ', ', { b: 'AOL' }, '…). ¿Tienes un enlace de calendario (.ics)? Toca ', { b: 'Otra' }, ' → ', { b: 'Añadir calendario suscrito' }, ' y pégalo.'],
          mock: 'accounts',
        },
        { text: ['Inicia sesión si lo pide y toca ', { b: 'Guardar' }, '.'] },
      ],
    } satisfies Record<Provider, readonly Step[]>,
    back: ['Vuelve a Tasks: tus eventos salen solos en la Agenda.'] as Line,
    tip: '¿No ves Apps? En iOS 17 es Ajustes → Calendario → Cuentas. En cualquier versión, escribe «Cuentas» en el buscador de arriba de Ajustes.',
    open: 'Abrir Ajustes',
    openNote: 'Se abre en la página de Tasks: vuelve atrás hasta Apps.',
  },
  en: {
    sheet: 'Add a calendar',
    kicker: 'Calendar',
    title: 'Bring in Google or Outlook',
    lead: 'Tasks shows what’s in the iPhone’s Calendar app. iCloud is already there; Google or Outlook are added once, in Settings.',
    tabs: { google: 'Google', outlook: 'Outlook', other: 'Other' },
    tabsLabel: 'Which calendar do you use?',
    path: ['Apps', 'Calendar', 'Calendar Accounts', 'Add Account'],
    pathLabel: 'Path in Settings',
    go: [{ b: 'Open Settings' }, ' and tap through:'] as Line,
    other: 'Other',
    calendars: 'Calendars',
    steps: {
      google: [
        { text: ['Choose ', { b: 'Google' }, ' and sign in with your Gmail account.'], mock: 'accounts' },
        { text: ['Leave ', { b: 'Calendars' }, ' on and tap ', { b: 'Save' }, '.'], mock: 'toggle' },
      ],
      outlook: [
        {
          text: ['Choose ', { b: 'Microsoft Exchange' }, ' for a work or school account, or ', { b: 'Outlook.com' }, ' for a personal one (@outlook, @hotmail). Sign in.'],
          mock: 'accounts',
        },
        { text: ['Leave ', { b: 'Calendars' }, ' on and tap ', { b: 'Save' }, '.'], mock: 'toggle' },
      ],
      other: [
        {
          text: ['Choose yours (', { b: 'Yahoo!' }, ', ', { b: 'AOL' }, '…). Got a calendar link (.ics)? Tap ', { b: 'Other' }, ' → ', { b: 'Add Subscribed Calendar' }, ' and paste it.'],
          mock: 'accounts',
        },
        { text: ['Sign in if asked and tap ', { b: 'Save' }, '.'] },
      ],
    } satisfies Record<Provider, readonly Step[]>,
    back: ['Come back to Tasks: your events show up in the Agenda on their own.'] as Line,
    tip: 'Can’t see Apps? On iOS 17 it’s Settings → Calendar → Accounts. On any version, type “Accounts” in the search field at the top of Settings.',
    open: 'Open Settings',
    openNote: 'It opens on Tasks’ page: go back to Apps.',
  },
} as const

/** Lo que se toca en cada proveedor, en la lista de cuentas del iPhone. */
const PICKED: Record<Provider, readonly string[]> = {
  google: ['Google'],
  outlook: ['Microsoft Exchange', 'Outlook.com'],
  other: ['other'],
}

const Rich = ({ line }: { line: Line }) => (
  <>{line.map((part, index) => (typeof part === 'string' ? <span key={index}>{part}</span> : <b key={index}>{part.b}</b>))}</>
)

/**
 * El paso a paso para traer Google, Outlook u otro calendario al Calendario del iPhone (y así a Tasks).
 * Arriba, la ruta en Ajustes como una fila de botones; debajo, lo de cada proveedor con un dibujo de lo
 * que hay que tocar, tal como sale en el iPhone. Plegado en una fila de Ajustes: solo sale si se pide.
 */
export function CalendarGuide({ open, onClose }: { open: boolean; onClose: () => void }) {
  const copy = useCopy(COPY)
  const [provider, setProvider] = useState<Provider>('google')
  const steps: readonly Step[] = copy.steps[provider]
  const openSettings = () => void import('../../lib/platform/native').then(({ TasksNative }) => TasksNative.openSettings())

  const footer = isNative ? (
    <>
      <button type="button" className="sheet__primary" onClick={openSettings}>
        {copy.open}
      </button>
      <p className="calguide__open-note">{copy.openNote}</p>
    </>
  ) : undefined

  return (
    <Sheet open={open} onClose={onClose} title={copy.sheet} footer={footer}>
      <header className="calguide__head">
        <p className="calguide__kicker">
          <IconCalendar size={14} />
          {copy.kicker}
        </p>
        <h2 className="calguide__title">{copy.title}</h2>
        <p className="calguide__lead">{copy.lead}</p>
      </header>

      <div className="segmented segmented--three calguide__tabs" role="radiogroup" aria-label={copy.tabsLabel}>
        {(['google', 'outlook', 'other'] as const).map((item) => (
          <button
            key={item}
            type="button"
            role="radio"
            aria-checked={provider === item}
            className={`segmented__option ${provider === item ? 'is-active' : ''}`}
            onClick={() => {
              haptic('selection')
              setProvider(item)
            }}
          >
            {copy.tabs[item]}
          </button>
        ))}
      </div>

      <ol className="calguide__steps">
        <li className="calguide__step">
          <span className="calguide__num">1</span>
          <div className="calguide__body">
            <p>
              <Rich line={copy.go} />
            </p>
            <ol className="calguide__path" aria-label={copy.pathLabel}>
              {copy.path.map((label, index) => (
                <li key={label} style={{ animationDelay: `${index * 70}ms` }}>
                  <span className="calguide__crumb">{label}</span>
                  {index < copy.path.length - 1 && <IconChevronRight size={12} className="calguide__sep" />}
                </li>
              ))}
            </ol>
          </div>
        </li>
        {steps.map((step, index) => (
          <li key={`${provider}-${index}`} className="calguide__step">
            <span className="calguide__num">{index + 2}</span>
            <div className="calguide__body">
              <p>
                <Rich line={step.text} />
              </p>
              {step.mock === 'accounts' && (
                <div className="ios-mock" aria-hidden="true">
                  {[...ACCOUNTS, 'other'].map((name) => {
                    const tap = PICKED[provider].includes(name)
                    return (
                      <div key={name} className={`ios-mock__row ${tap ? 'is-tap' : ''}`}>
                        <span className="ios-mock__label">{name === 'other' ? copy.other : name}</span>
                        {tap && <span className="ios-mock__finger" />}
                      </div>
                    )
                  })}
                </div>
              )}
              {step.mock === 'toggle' && (
                <div className="ios-mock" aria-hidden="true">
                  <div className="ios-mock__row is-tap">
                    <span className="ios-mock__label">{copy.calendars}</span>
                    <span className="ios-mock__toggle" />
                  </div>
                </div>
              )}
            </div>
          </li>
        ))}
        <li className="calguide__step is-last">
          <span className="calguide__num calguide__num--done">
            <IconCheck size={13} strokeWidth={2.6} />
          </span>
          <div className="calguide__body">
            <p>
              <Rich line={copy.back} />
            </p>
          </div>
        </li>
      </ol>

      <p className="group__note calguide__tip">{copy.tip}</p>
    </Sheet>
  )
}
