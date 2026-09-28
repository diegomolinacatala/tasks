import { shortTime } from '../../lib/date'
import { upcomingSchedule } from '../../lib/schedule'
import { useAppState, useDispatch } from '../../state/StoreProvider'
import { isNative } from '../../lib/platform'
import { usePush } from '../push/PushProvider'
import { IconBell, IconBellOff } from '../ui/Icons'
import { PickerChip } from '../ui/PickerChip'

export function NotificationsBlock() {
  const push = usePush()
  const state = useAppState()
  const dispatch = useDispatch()

  if (push.status === 'unconfigured') return null

  const { digest } = state.settings
  const scheduled = upcomingSchedule(state, Date.now()).filter((entry) => entry.taskId !== null).length

  return (
    <>
      <p className="sheet__title">Avisos</p>

      {push.status === 'needs-install' && (
        <p className="sheet__note">En iPhone: Compartir → Añadir a pantalla de inicio, y abre Tasks desde ese icono.</p>
      )}

      {push.status === 'unsupported' && <p className="sheet__note">Este navegador no admite avisos.</p>}

      {push.status === 'denied' &&
        (isNative ? (
          <button type="button" className="sheet__row" onClick={() => void push.disable()}>
            <IconBellOff size={18} />
            Bloqueados: abrir Ajustes
          </button>
        ) : (
          <p className="sheet__note">Bloqueados. Actívalos en Ajustes → Notificaciones → Tasks.</p>
        ))}

      {push.status === 'off' && (
        <button type="button" className="sheet__row" disabled={push.busy} onClick={() => void push.enable()}>
          <IconBell size={18} />
          Activar avisos
        </button>
      )}

      {push.status === 'on' && (
        <>
          <p className="sheet__note">
            {scheduled === 1 ? '1 recordatorio programado' : `${scheduled} recordatorios programados`}
            {push.syncFailed ? ' · pendiente de sincronizar' : ''}
          </p>

          <p className="sheet__title">Resumen del día</p>
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

          <button type="button" className="sheet__row" disabled={push.busy} onClick={() => void push.disable()}>
            <IconBellOff size={18} />
            {isNative ? 'Ajustes de notificaciones' : 'Desactivar avisos'}
          </button>
        </>
      )}
    </>
  )
}
