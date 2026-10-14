import { useState } from 'react'
import { shortTime } from '../../lib/date'
import { haptic } from '../../lib/platform/feedback'
import { isNative } from '../../lib/platform'
import { useCopy } from '../../state/LanguageProvider'
import { useAppState, useDispatch } from '../../state/StoreProvider'
import { usePush } from '../push/PushProvider'
import { IconArrowUpRight, IconBell, IconBellOff, IconChevronRight } from '../ui/Icons'
import { PickerChip } from '../ui/PickerChip'
import { Sheet } from '../ui/Sheet'
import { SettingsRow, SettingsSheetTitle } from './SettingsRow'
import { Switch } from './Switch'

const COPY = {
  es: {
    title: 'Avisos',
    install: 'En iPhone: Compartir → Añadir a pantalla de inicio, y abre Tasks desde ese icono.',
    unsupported: 'Este navegador no admite avisos.',
    blockedOpen: 'Bloqueados: abrir Ajustes del iPhone',
    blocked: 'Bloqueados. Actívalos en Ajustes del iPhone → Notificaciones → Tasks.',
    blockedBrowser: 'Bloqueados. Permítelos en los ajustes del sitio de tu navegador.',
    enable: 'Activar avisos',
    enabling: 'Activando…',
    failed: 'Los avisos no se han podido programar',
    retry: 'Reintentar',
    digest: 'Resumen del día',
    time: 'Hora',
    nativeSettings: 'Ajustes de notificaciones',
    disable: 'Desactivar avisos',
    disableNote: 'Sin avisos, el dictado usa el del navegador.',
    value: {
      on: 'Activados',
      digest: (time: string) => `Resumen a las ${time}`,
      off: 'Desactivados',
      denied: 'Bloqueados',
      'needs-install': 'Instala la app',
      unsupported: 'No disponibles',
      failed: 'Sin programar',
    },
  },
  en: {
    title: 'Notifications',
    install: 'On iPhone: Share → Add to Home Screen, then open Tasks from that icon.',
    unsupported: 'This browser doesn’t support notifications.',
    blockedOpen: 'Blocked: open iPhone Settings',
    blocked: 'Blocked. Turn them on in iPhone Settings → Notifications → Tasks.',
    blockedBrowser: 'Blocked. Allow them in your browser’s site settings.',
    enable: 'Turn on notifications',
    enabling: 'Turning on…',
    failed: 'Reminders couldn’t be scheduled',
    retry: 'Retry',
    digest: 'Daily summary',
    time: 'Time',
    nativeSettings: 'Notification settings',
    disable: 'Turn off notifications',
    disableNote: 'Without notifications, dictation uses the browser’s.',
    value: {
      on: 'On',
      digest: (time: string) => `Summary at ${time}`,
      off: 'Off',
      denied: 'Blocked',
      'needs-install': 'Install the app',
      unsupported: 'Not available',
      failed: 'Not scheduled',
    },
  },
} as const

/**
 * Ajustes → Avisos: una fila que dice cómo están (con el resumen del día, su hora) y, en su panel, todo lo
 * de antes: activarlos, el resumen y su hora, y los ajustes del sistema. Sin servidor (en local), no sale.
 */
export function NotificationsRow() {
  const push = usePush()
  const copy = useCopy(COPY)
  const { digest } = useAppState().settings
  const [open, setOpen] = useState(false)

  if (push.status === 'unconfigured') return null

  const value =
    push.status === 'on'
      ? push.syncFailed
        ? copy.value.failed
        : digest.enabled
          ? copy.value.digest(shortTime(digest.time))
          : copy.value.on
      : copy.value[push.status]
  const danger = push.status === 'denied' || (push.status === 'on' && push.syncFailed)

  return (
    <>
      <SettingsRow
        icon={push.status === 'on' ? <IconBell size={17} /> : <IconBellOff size={17} />}
        label={copy.title}
        value={value}
        danger={danger}
        onClick={() => setOpen(true)}
      />
      <Sheet open={open} onClose={() => setOpen(false)} title={copy.title}>
        <SettingsSheetTitle>{copy.title}</SettingsSheetTitle>
        <NotificationsPanel />
      </Sheet>
    </>
  )
}

/** Lo de dentro del panel: lo mismo que antes ocupaba su grupo en la página. */
function NotificationsPanel() {
  const push = usePush()
  const copy = useCopy(COPY)
  const state = useAppState()
  const dispatch = useDispatch()
  const { digest } = state.settings

  return (
    <>

      {push.status === 'needs-install' && (
        <p className="group__note">{copy.install}</p>
      )}

      {push.status === 'unsupported' && <p className="group__note">{copy.unsupported}</p>}

      {push.status === 'denied' &&
        (isNative ? (
          <div className="group__card">
            <button type="button" className="group__row group__row--danger" onClick={() => void push.disable()}>
              <IconBellOff size={18} />
              <span className="group__label">{copy.blockedOpen}</span>
              <IconChevronRight size={16} className="group__chevron" />
            </button>
          </div>
        ) : (
          <p className="group__note">{/iPhone|iPad/.test(navigator.userAgent) ? copy.blocked : copy.blockedBrowser}</p>
        ))}

      {push.status === 'off' && (
        <div className="group__card">
          <button type="button" className="group__row" disabled={push.busy} onClick={() => void push.enable()}>
            <IconBell size={18} />
            <span className="group__label">{push.busy ? copy.enabling : copy.enable}</span>
            <IconChevronRight size={16} className="group__chevron" />
          </button>
        </div>
      )}

      {push.status === 'on' && (
        <>
          <div className="group__card">
            {push.syncFailed && (
              <button type="button" className="group__row group__row--danger" onClick={push.retry}>
                <IconBell size={18} />
                <span className="group__label">{copy.failed}</span>
                <span className="group__value">{copy.retry}</span>
              </button>
            )}
            {/* Sí o no con un interruptor y, encendido, la hora en su fila: como el resto de Ajustes. */}
            <div className="group__row group__row--static">
              <span className="group__label">{copy.digest}</span>
              <Switch
                checked={digest.enabled}
                label={copy.digest}
                onChange={(enabled) => {
                  haptic('selection')
                  dispatch({ type: 'settings/digest', enabled })
                }}
              />
            </div>
            {digest.enabled && (
              <PickerChip
                type="time"
                className="group__row"
                value={digest.time}
                onCommit={(time) => {
                  if (time) dispatch({ type: 'settings/digest', enabled: true, time })
                }}
              >
                <span className="group__label">{copy.time}</span>
                <span className="group__value">{shortTime(digest.time)}</span>
                <IconChevronRight size={16} className="group__chevron" />
              </PickerChip>
            )}
            {/* En el iPhone la fila abre los Ajustes del sistema (no desactiva nada): flecha de salir, no campana tachada. */}
            <button type="button" className="group__row" disabled={push.busy} onClick={() => void push.disable()}>
              {isNative ? <IconArrowUpRight size={18} /> : <IconBellOff size={18} />}
              <span className="group__label">{isNative ? copy.nativeSettings : copy.disable}</span>
              <IconChevronRight size={16} className="group__chevron" />
            </button>
          </div>
          {!isNative && push.canTranscribe && <p className="group__note">{copy.disableNote}</p>}
        </>
      )}
    </>
  )
}
