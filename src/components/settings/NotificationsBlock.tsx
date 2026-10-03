import { shortTime } from '../../lib/date'
import { isNative } from '../../lib/platform'
import { nativePlan } from '../../lib/nativeSchedule'
import { upcomingSchedule } from '../../lib/schedule'
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
    blockedOpen: 'Bloqueados: abrir Ajustes',
    blocked: 'Bloqueados. Actívalos en Ajustes → Notificaciones → Tasks.',
    enable: 'Activar avisos',
    scheduled: 'Programados',
    unsynced: ' · sin sincronizar',
    digest: 'Resumen del día',
    no: 'No',
    daily: (clock: string) => `Cada día a las ${clock}`,
    morning: 'Cada mañana',
    nativeSettings: 'Ajustes de notificaciones',
    disable: 'Desactivar avisos',
  },
  en: {
    title: 'Reminders',
    install: 'On iPhone: Share → Add to Home Screen, then open Tasks from that icon.',
    unsupported: 'This browser doesn’t support reminders.',
    blockedOpen: 'Blocked: open Settings',
    blocked: 'Blocked. Turn them on in Settings → Notifications → Tasks.',
    enable: 'Turn on reminders',
    scheduled: 'Scheduled',
    unsynced: ' · not synced',
    digest: 'Daily summary',
    no: 'Off',
    daily: (clock: string) => `Every day at ${clock}`,
    morning: 'Every morning',
    nativeSettings: 'Notification settings',
    disable: 'Turn off reminders',
  },
} as const

export function NotificationsBlock() {
  const push = usePush()
  const copy = useCopy(COPY)
  const state = useAppState()
  const dispatch = useDispatch()

  if (push.status === 'unconfigured') return null

  const { digest } = state.settings
  // En el iPhone, lo que de verdad hay programado (iOS guarda 64 como mucho); en la web, lo que se sube.
  const now = Date.now()
  const scheduled = isNative
    ? nativePlan(state, now).timed.filter((entry) => entry.extra.taskId || entry.extra.routineId).length
    : upcomingSchedule(state, now).filter((entry) => entry.taskId !== null || entry.routine).length

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
          <p className="group__note">{copy.blocked}</p>
        ))}

      {push.status === 'off' && (
        <div className="group__card">
          <button type="button" className="group__row" disabled={push.busy} onClick={() => void push.enable()}>
            <IconBell size={18} />
            <span className="group__label">{copy.enable}</span>
            <IconChevronRight size={16} className="group__chevron" />
          </button>
        </div>
      )}

      {push.status === 'on' && (
        <>
          <div className="group__card">
            <div className="group__row group__row--static">
              <IconBell size={18} />
              <span className="group__label">{copy.scheduled}</span>
              <span className="group__value">
                {scheduled}
                {push.syncFailed ? copy.unsynced : ''}
              </span>
            </div>
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
