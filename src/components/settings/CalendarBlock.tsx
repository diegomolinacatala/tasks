import { useState } from 'react'
import type { CSSProperties } from 'react'
import { haptic } from '../../lib/platform/feedback'
import { isNative } from '../../lib/platform'
import { useCopy } from '../../state/LanguageProvider'
import { useAppState, useDispatch } from '../../state/StoreProvider'
import { useExportFailed } from '../calendar/CalendarExportSync'
import { useCalendar } from '../calendar/CalendarProvider'
import { IconCalendar, IconChevronRight } from '../ui/Icons'
import { Sheet } from '../ui/Sheet'
import { useToast } from '../ui/Toast'
import { SettingsRow, SettingsSheetTitle } from './SettingsRow'
import { CalendarExportSheet } from './CalendarExportSheet'
import { CalendarGuide } from './CalendarGuide'
import { CalendarPicker } from './CalendarPicker'
import { Switch } from './Switch'
import './calendar.css'

const COPY = {
  es: {
    title: 'Calendario',
    connect: 'Ver mi calendario en la Agenda',
    promptNote: (device: string) => `Tus eventos de iCloud, Google u Outlook salen en el horario, junto a tus tareas. Todo queda en este ${device}: no se sube a ningún servidor.`,
    device: 'iPhone',
    genericDevice: 'dispositivo',
    denied: 'Sin permiso: abrir Ajustes del iPhone',
    deniedNote: 'En Ajustes del iPhone, toca Calendarios y elige Acceso total.',
    shown: 'En la Agenda',
    calendars: 'Calendarios',
    count: (shown: number, total: number) => (shown === total ? 'Todos' : `${shown} de ${total}`),
    exportRow: 'Añadir mis tareas',
    exportOff: 'No',
    exportMissing: 'No encontrado',
    exportMissingNote: 'El calendario elegido ya no existe: elige otro o deja de añadirlas.',
    exportWhileOff: (name: string) => `Tus tareas siguen añadiéndose a «${name}».`,
    exportFailed: 'No se han podido añadir al calendario. Se volverá a intentar.',
    guide: 'Añadir Google u Outlook',
    guideHint: 'Paso a paso',
    connected: 'Listo: tu calendario ya sale en la Agenda.',
    value: { prompt: 'Sin conectar', denied: 'Sin permiso', hidden: 'Oculto', missing: 'Revisar' },
  },
  en: {
    title: 'Calendar',
    connect: 'Show my calendar in the Agenda',
    promptNote: (device: string) => `Your iCloud, Google or Outlook events show up in your schedule, next to your tasks. It all stays on this ${device}: nothing is uploaded to any server.`,
    device: 'iPhone',
    genericDevice: 'device',
    denied: 'No access: open iPhone Settings',
    deniedNote: 'In iPhone Settings, tap Calendars and choose Full Access.',
    shown: 'In the Agenda',
    calendars: 'Calendars',
    count: (shown: number, total: number) => (shown === total ? 'All' : `${shown} of ${total}`),
    exportRow: 'Add my tasks',
    exportOff: 'Off',
    exportMissing: 'Not found',
    exportMissingNote: 'The chosen calendar no longer exists: pick another or stop adding them.',
    exportWhileOff: (name: string) => `Your tasks are still being added to “${name}”.`,
    exportFailed: 'They couldn’t be added to the calendar. It’ll try again.',
    guide: 'Add Google or Outlook',
    guideHint: 'Step by step',
    connected: 'Done: your calendar now shows up in the Agenda.',
    value: { prompt: 'Not connected', denied: 'No access', hidden: 'Hidden', missing: 'Check' },
  },
} as const

/**
 * El calendario del iPhone en Ajustes, en poco sitio: conectarlo, apagarlo, elegir qué calendarios se
 * ven y, plegado en una fila, el paso a paso para traer Google u Outlook (la mayoría no los tiene en el
 * Calendario del iPhone). Sin calendario en la plataforma (la PWA), no sale.
 */
export function CalendarRow() {
  const calendar = useCalendar()
  const settings = useAppState().settings.calendar
  const dispatch = useDispatch()
  const toast = useToast()
  const copy = useCopy(COPY)
  const [picking, setPicking] = useState(false)
  const [guiding, setGuiding] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [busy, setBusy] = useState(false)
  const [open, setOpen] = useState(false)
  const exportFailed = useExportFailed()

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
  const exportTarget = calendar.calendars.find((item) => item.id === settings.export)
  // El calendario elegido puede haberse borrado (o la cuenta): se dice en ladrillo, no con puntos suspensivos.
  const exportMissing = Boolean(settings.export) && calendar.calendars.length > 0 && !exportTarget
  const exportName = exportTarget?.title ?? (settings.export ? (exportMissing ? copy.exportMissing : '…') : copy.exportOff)
  const device = isNative ? copy.device : copy.genericDevice

  const guideRow = (
    <button type="button" className="group__row" onClick={() => setGuiding(true)}>
      <span className="group__label">{copy.guide}</span>
      <span className="group__value">{copy.guideHint}</span>
      <IconChevronRight size={16} className="group__chevron" />
    </button>
  )

  // En la fila, cómo está de un vistazo: sin conectar, sin permiso, oculto, cuántos calendarios se ven, o
  // que hay algo que revisar (el calendario donde van tus tareas ya no está, o no se han podido añadir).
  const trouble = exportMissing || (exportFailed && Boolean(settings.export))
  const value =
    calendar.status === 'prompt'
      ? copy.value.prompt
      : calendar.status === 'denied'
        ? copy.value.denied
        : calendar.status === 'granted'
          ? trouble
            ? copy.value.missing
            : settings.enabled
              ? copy.count(shown, mine.length)
              : copy.value.hidden
          : ''

  return (
    <>
      <SettingsRow
        icon={<IconCalendar size={17} />}
        label={copy.title}
        value={value}
        danger={calendar.status === 'denied' || (calendar.status === 'granted' && trouble)}
        onClick={() => setOpen(true)}
      />
      <Sheet open={open} onClose={() => setOpen(false)} title={copy.title}>
        <SettingsSheetTitle>{copy.title}</SettingsSheetTitle>

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
            <p className="group__note">{copy.promptNote(device)}</p>
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
                <IconCalendar size={18} />
                <span className="group__label">{copy.exportRow}</span>
                <span className={`group__value calexport__value ${exportMissing ? 'group__value--danger' : ''}`}>{exportName}</span>
                <IconChevronRight size={16} className="group__chevron" />
              </button>
              {guideRow}
            </div>
            {exportMissing && <p className="group__note group__note--danger">{copy.exportMissingNote}</p>}
            {!settings.enabled && exportTarget && <p className="group__note">{copy.exportWhileOff(exportTarget.title)}</p>}
            {exportFailed && settings.export && !exportMissing && <p className="group__note group__note--danger">{copy.exportFailed}</p>}
          </>
        )}
      </Sheet>

      <CalendarPicker open={picking} onClose={() => setPicking(false)} />
      <CalendarGuide
        open={guiding}
        connected={calendar.status === 'granted'}
        onConnect={calendar.status === 'prompt' ? () => void connect() : undefined}
        onClose={() => setGuiding(false)}
      />
      <CalendarExportSheet open={exporting} onClose={() => setExporting(false)} />
    </>
  )
}
