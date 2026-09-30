import { shortTime } from '../../lib/date'
import { isNative } from '../../lib/platform'
import { nativePlan } from '../../lib/nativeSchedule'
import { upcomingSchedule } from '../../lib/schedule'
import { useAppState, useDispatch } from '../../state/StoreProvider'
import { usePush } from '../push/PushProvider'
import { IconBell, IconBellOff, IconChevronRight } from '../ui/Icons'
import { PickerChip } from '../ui/PickerChip'

export function NotificationsBlock() {
  const push = usePush()
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
      <h2 className="group__title">Avisos</h2>

      {push.status === 'needs-install' && (
        <p className="group__note">En iPhone: Compartir → Añadir a pantalla de inicio, y abre Tasks desde ese icono.</p>
      )}

      {push.status === 'unsupported' && <p className="group__note">Este navegador no admite avisos.</p>}

      {push.status === 'denied' &&
        (isNative ? (
          <div className="group__card">
            <button type="button" className="group__row group__row--danger" onClick={() => void push.disable()}>
              <IconBellOff size={18} />
              <span className="group__label">Bloqueados: abrir Ajustes</span>
              <IconChevronRight size={16} className="group__chevron" />
            </button>
          </div>
        ) : (
          <p className="group__note">Bloqueados. Actívalos en Ajustes → Notificaciones → Tasks.</p>
        ))}

      {push.status === 'off' && (
        <div className="group__card">
          <button type="button" className="group__row" disabled={push.busy} onClick={() => void push.enable()}>
            <IconBell size={18} />
            <span className="group__label">Activar avisos</span>
            <IconChevronRight size={16} className="group__chevron" />
          </button>
        </div>
      )}

      {push.status === 'on' && (
        <>
          <div className="group__card">
            <div className="group__row group__row--static">
              <IconBell size={18} />
              <span className="group__label">Programados</span>
              <span className="group__value">
                {scheduled}
                {push.syncFailed ? ' · sin sincronizar' : ''}
              </span>
            </div>
            <div className="group__row group__row--static group__row--stack">
              <span className="group__label">Resumen del día</span>
              <div className="sheet__chips">
                <button
                  type="button"
                  className={`chip ${digest.enabled ? '' : 'is-active'}`}
                  onClick={() => dispatch({ type: 'settings/digest', enabled: false })}
                >
                  No
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
                  {digest.enabled ? `Cada día a las ${shortTime(digest.time)}` : 'Cada mañana'}
                </PickerChip>
              </div>
            </div>
            <button type="button" className="group__row" disabled={push.busy} onClick={() => void push.disable()}>
              <IconBellOff size={18} />
              <span className="group__label">{isNative ? 'Ajustes de notificaciones' : 'Desactivar avisos'}</span>
              <IconChevronRight size={16} className="group__chevron" />
            </button>
          </div>
        </>
      )}
    </section>
  )
}
