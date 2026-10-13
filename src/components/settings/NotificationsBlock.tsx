import { shortTime } from '../../lib/date'
import { isNative } from '../../lib/platform'
import { useCopy } from '../../state/LanguageProvider'
import { useAppState, useDispatch } from '../../state/StoreProvider'
import { usePush } from '../push/PushProvider'
import { IconBell, IconBellOff, IconChevronRight } from '../ui/Icons'
import { PickerChip } from '../ui/PickerChip'

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
    no: 'No',
    daily: (clock: string) => `Cada día a las ${clock}`,
    morning: 'Cada mañana',
    nativeSettings: 'Ajustes de notificaciones',
    disable: 'Desactivar avisos',
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
    no: 'Off',
    daily: (clock: string) => `Every day at ${clock}`,
    morning: 'Every morning',
    nativeSettings: 'Notification settings',
    disable: 'Turn off notifications',
  },
} as const

export function NotificationsBlock() {
  const push = usePush()
  const copy = useCopy(COPY)
  const state = useAppState()
  const dispatch = useDispatch()

  if (push.status === 'unconfigured') return null

  const { digest } = state.settings

  return (
    <section className="group">
      <h2 className="group__title">{copy.title}</h2>

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
            <div className="group__row group__row--static group__row--stack">
              <span className="group__label">{copy.digest}</span>
              <div className="sheet__chips">
                <button
                  type="button"
                  className={`chip ${digest.enabled ? '' : 'is-active'}`}
                  onClick={() => dispatch({ type: 'settings/digest', enabled: false })}
                >
                  {copy.no}
                </button>
                <PickerChip
                  type="time"
                  className={`chip ${digest.enabled ? 'is-active' : ''}`}
                  value={digest.time}
                  onOpen={() => dispatch({ type: 'settings/digest', enabled: true })}
                  onCommit={(time) => {
                    if (time) dispatch({ type: 'settings/digest', enabled: true, time })
                  }}
                >
                  {digest.enabled ? copy.daily(shortTime(digest.time)) : copy.morning}
                </PickerChip>
              </div>
            </div>
            <button type="button" className="group__row" disabled={push.busy} onClick={() => void push.disable()}>
              <IconBellOff size={18} />
              <span className="group__label">{isNative ? copy.nativeSettings : copy.disable}</span>
              <IconChevronRight size={16} className="group__chevron" />
            </button>
          </div>
        </>
      )}
    </section>
  )
}
