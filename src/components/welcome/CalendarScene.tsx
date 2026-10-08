import { useState } from 'react'
import type { CSSProperties } from 'react'
import { haptic } from '../../lib/platform/feedback'
import { isNative } from '../../lib/platform'
import { useCopy } from '../../state/LanguageProvider'
import { useAppState, useDispatch } from '../../state/StoreProvider'
import { useCalendar } from '../calendar/CalendarProvider'
import { IconCalendar, IconCheck } from '../ui/Icons'
import { Clock } from '../views/Timeline'
import '../views/agenda.css'

interface SceneRow {
  /** Minutos desde medianoche. */
  at: number
  minutes: number
  title: string
  /** Del calendario del iPhone, con el color de su calendario; si no, una tarea. */
  color?: string
  meta?: string
}

const COPY = {
  es: {
    day: ['Hoy', 'jueves'],
    rows: [
      { at: 570, minutes: 15, title: 'Reunión diaria', color: '#1a73e8', meta: 'Meet' },
      { at: 660, minutes: 30, title: 'Enviar el presupuesto' },
      { at: 810, minutes: 75, title: 'Comida con Carlota', color: '#34c759', meta: 'La Pepica' },
      { at: 1020, minutes: 0, title: 'Llamar al banco' },
    ] satisfies SceneRow[],
    connect: 'Conectar mi calendario',
    show: 'Enseñarlo en la Agenda',
    connected: 'Conectado',
    denied: 'Sin permiso: abrir Ajustes',
    label: 'Un día con tareas y eventos del calendario',
  },
  en: {
    day: ['Today', 'Thursday'],
    rows: [
      { at: 570, minutes: 15, title: 'Daily standup', color: '#1a73e8', meta: 'Meet' },
      { at: 660, minutes: 30, title: 'Send the quote' },
      { at: 810, minutes: 75, title: 'Lunch with Carlota', color: '#34c759', meta: 'La Pepica' },
      { at: 1020, minutes: 0, title: 'Call the bank' },
    ] satisfies SceneRow[],
    connect: 'Connect my calendar',
    show: 'Show it in the Agenda',
    connected: 'Connected',
    denied: 'No access: open Settings',
    label: 'A day with tasks and calendar events',
  },
} as const

const node = (minutes: number) => `${Math.round(Math.min(64, Math.max(24, minutes * 0.75)))}px`

/**
 * Un día de la Agenda con las tareas de siempre y, entre ellas, los eventos del calendario, que entran
 * con el color de su calendario: así se ve qué cambia. Debajo, conectarlo en ese mismo momento.
 */
export function CalendarScene() {
  const copy = useCopy(COPY)
  const calendar = useCalendar()
  const enabled = useAppState().settings.calendar.enabled
  const dispatch = useDispatch()
  const [busy, setBusy] = useState(false)
  const connected = calendar.status === 'granted' && enabled

  const act = async () => {
    if (busy || connected) return
    haptic('selection')
    if (calendar.status === 'denied') {
      if (isNative) void import('../../lib/platform/native').then(({ TasksNative }) => TasksNative.openSettings())
      return
    }
    if (calendar.status === 'granted') {
      dispatch({ type: 'settings/calendar', enabled: true })
      haptic('success')
      return
    }
    setBusy(true)
    const status = await calendar.connect()
    setBusy(false)
    if (status === 'granted') haptic('success')
  }

  const label = connected ? copy.connected : calendar.status === 'denied' ? copy.denied : calendar.status === 'granted' ? copy.show : copy.connect
  // Los eventos entran uno detrás de otro.
  const eventTitles = copy.rows.filter((row: SceneRow) => row.color !== undefined).map((row) => row.title)

  return (
    <div className="scene scene--calendar">
      <p className="scene__day">
        {copy.day[0]} <span>{copy.day[1]}</span>
      </p>
      <ol className="timeline scene__timeline" aria-label={copy.label}>
        {copy.rows.map((row: SceneRow) => {
          const event = row.color !== undefined
          const order = eventTitles.indexOf(row.title) + 1
          return (
            <li
              key={row.title}
              className={`tl ${event ? 'tl--event cal-tone scene__event' : 'scene__task'}`}
              style={{ '--node': node(row.minutes), '--cal': row.color, '--order': order } as CSSProperties}
            >
              <span className="tl__time">
                <Clock minutes={row.at} />
              </span>
              <span className="tl__rail">
                <span className={`tl__node ${event ? 'tl__node--event' : ''}`} aria-hidden="true" />
              </span>
              <span className="tl__body">
                <span className="tl__title">{row.title}</span>
                {row.meta && <span className="tl__meta">{row.meta}</span>}
              </span>
            </li>
          )
        })}
      </ol>
      {calendar.available && (
        <button type="button" className={`scene__connect ${connected ? 'is-done' : ''}`} disabled={busy} onClick={() => void act()}>
          {connected ? <IconCheck size={15} strokeWidth={2.6} /> : <IconCalendar size={16} />}
          {label}
        </button>
      )}
    </div>
  )
}
