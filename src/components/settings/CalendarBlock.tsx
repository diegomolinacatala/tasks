import { useState } from 'react'
import type { CSSProperties } from 'react'
import { haptic } from '../../lib/platform/feedback'
import { isNative } from '../../lib/platform'
import { useCopy } from '../../state/LanguageProvider'
import { useAppState, useDispatch } from '../../state/StoreProvider'
import { useCalendar } from '../calendar/CalendarProvider'
import { IconCalendar, IconCheck, IconChevronRight } from '../ui/Icons'
import { useToast } from '../ui/Toast'
import { CalendarExportSheet } from './CalendarExportSheet'
import { CalendarGuide } from './CalendarGuide'
import { CalendarPicker } from './CalendarPicker'
import { Switch } from './Switch'
import './calendar.css'

const COPY = {
  es: {
    title: 'Calendario',
    connect: 'Ver mi calendario en la Agenda',
    promptNote: 'Tus eventos de iCloud, Google u Outlook salen en el horario, junto a tus tareas. Todo queda en este iPhone: no se sube a ningún servidor.',
    denied: 'Sin permiso: abrir Ajustes',
    deniedNote: 'En Ajustes, toca Calendarios y elige Acceso total.',
    shown: 'En la Agenda',
    calendars: 'Calendarios',
    count: (shown: number, total: number) => (shown === total ? 'Todos' : `${shown} de ${total}`),
    exportRow: 'Añadir mis tareas',
    exportOff: 'No',
    guide: 'Añadir Google u Outlook',
    guideHint: 'Paso a paso',
    onNote: 'Todo queda en este iPhone. Toca un evento para verlo o cambiarlo en Calendario.',
    connected: 'Listo: tu calendario ya sale en la Agenda.',
  },
  en: {
    title: 'Calendar',
    connect: 'Show my calendar in the Agenda',
    promptNote: 'Your iCloud, Google or Outlook events show up in your schedule, next to your tasks. It all stays on this iPhone: nothing is uploaded to any server.',
    denied: 'No access: open Settings',
    deniedNote: 'In Settings, tap Calendars and choose Full Access.',
    shown: 'In the Agenda',
    calendars: 'Calendars',
    count: (shown: number, total: number) => (shown === total ? 'All' : `${shown} of ${total}`),
    exportRow: 'Add my tasks',
    exportOff: 'Off',
    guide: 'Add Google or Outlook',
    guideHint: 'Step by step',
    onNote: 'It all stays on this iPhone. Tap an event to see or change it in Calendar.',
    connected: 'Done: your calendar now shows up in the Agenda.',
  },
} as const

/**
 * El calendario del iPhone en Ajustes, en poco sitio: conectarlo, apagarlo, elegir qué calendarios se
 * ven y, plegado en una fila, el paso a paso para traer Google u Outlook (la mayoría no los tiene en el
 * Calendario del iPhone). Sin calendario en la plataforma (la PWA), no sale.
 */
export function CalendarBlock() {
  const calendar = useCalendar()
  const settings = useAppState().settings.calendar
  const dispatch = useDispatch()
  const toast = useToast()
  const copy = useCopy(COPY)
  const [picking, setPicking] = useState(false)
  const [guiding, setGuiding] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [busy, setBusy] = useState(false)

  if (!calendar.available) return null

  const connect = async () => {
    if (busy) return
    setBusy(true)
    const status = await calendar.connect()
    setBusy(false)
    if (status === 'granted') {
      haptic('success')
      toast({ message: copy.connected })
    }
  }

  const openSettings = () => void import('../../lib/platform/native').then(({ TasksNative }) => TasksNative.openSettings())
  // El «Tasks» de la app no cuenta entre los tuyos: sus eventos son tus tareas, que ya se ven.
  const mine = calendar.calendars.filter((item) => !item.own)
  const shown = mine.filter((item) => !settings.hidden.includes(item.id)).length
  const exportName = calendar.calendars.find((item) => item.id === settings.export)?.title ?? (settings.export ? '…' : copy.exportOff)

  const guideRow = (
    <button type="button" className="group__row" onClick={() => setGuiding(true)}>
      <span className="group__label">{copy.guide}</span>
      <span className="group__value">{copy.guideHint}</span>
      <IconChevronRight size={16} className="group__chevron" />
    </button>
  )

  return (
    <section className="group">
      <h2 className="group__title">{copy.title}</h2>

      {calendar.status === 'unknown' && <div className="group__card group__card--placeholder" aria-hidden="true" />}

      {calendar.status === 'prompt' && (
        <>
          <div className="group__card">
            <button type="button" className="group__row calendar-connect" disabled={busy} onClick={() => void connect()}>
              <IconCalendar size={18} />
              <span className="group__label">{copy.connect}</span>
              <IconChevronRight size={16} className="group__chevron" />
            </button>
            {guideRow}
          </div>
          <p className="group__note">{copy.promptNote}</p>
        </>
      )}

      {calendar.status === 'denied' && (
        <>
          <div className="group__card">
            <button type="button" className="group__row group__row--danger" onClick={isNative ? openSettings : undefined}>
              <IconCalendar size={18} />
              <span className="group__label">{copy.denied}</span>
              <IconChevronRight size={16} className="group__chevron" />
            </button>
            {guideRow}
          </div>
          <p className="group__note">{copy.deniedNote}</p>
        </>
      )}

      {calendar.status === 'granted' && (
        <>
          <div className="group__card">
            <div className="group__row group__row--static">
              <IconCalendar size={18} />
              <span className="group__label">{copy.shown}</span>
              <Switch
                checked={settings.enabled}
                label={copy.shown}
                onChange={(enabled) => {
                  haptic('selection')
                  dispatch({ type: 'settings/calendar', enabled })
                }}
              />
            </div>
            {settings.enabled && mine.length > 0 && (
              <button type="button" className="group__row" onClick={() => setPicking(true)}>
                <span className="calendar-dots" aria-hidden="true">
                  {mine
                    .filter((item) => !settings.hidden.includes(item.id))
                    .slice(0, 4)
                    .map((item) => (
                      <i key={item.id} className="cal-tone" style={{ '--cal': item.color } as CSSProperties} />
                    ))}
                </span>
                <span className="group__label">{copy.calendars}</span>
                <span className="group__value">{copy.count(shown, mine.length)}</span>
                <IconChevronRight size={16} className="group__chevron" />
              </button>
            )}
            <button type="button" className="group__row" onClick={() => setExporting(true)}>
              <IconCheck size={18} />
              <span className="group__label">{copy.exportRow}</span>
              <span className="group__value calexport__value">{exportName}</span>
              <IconChevronRight size={16} className="group__chevron" />
            </button>
            {guideRow}
          </div>
          <p className="group__note">{copy.onNote}</p>
        </>
      )}

      <CalendarPicker open={picking} onClose={() => setPicking(false)} />
      <CalendarGuide open={guiding} onClose={() => setGuiding(false)} />
      <CalendarExportSheet open={exporting} onClose={() => setExporting(false)} />
    </section>
  )
}
