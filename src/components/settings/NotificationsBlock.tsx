import { shortTime, timeOfInstant } from '../../lib/date'
import { upcomingSchedule } from '../../lib/reminders'
import { useAppState } from '../../state/StoreProvider'
import { usePush } from '../push/PushProvider'
import { IconBell, IconBellOff } from '../ui/Icons'

export function NotificationsBlock() {
  const push = usePush()
  const state = useAppState()

  if (push.status === 'unconfigured') return null

  const scheduled = upcomingSchedule(state, Date.now()).length

  return (
    <>
      <p className="sheet__title">Avisos</p>

      {push.status === 'needs-install' && (
        <p className="sheet__note">En iPhone: Compartir → Añadir a pantalla de inicio, y abre Tasks desde ese icono.</p>
      )}

      {push.status === 'unsupported' && <p className="sheet__note">Este navegador no admite avisos.</p>}

      {push.status === 'denied' && (
        <p className="sheet__note">Bloqueados. Actívalos en Ajustes → Notificaciones → Tasks.</p>
      )}

      {push.status === 'off' && (
        <button type="button" className="sheet__row" disabled={push.busy} onClick={() => void push.enable()}>
          <IconBell size={18} />
          Activar avisos
        </button>
      )}

      {push.status === 'on' && (
        <>
          <p className="sheet__note">
            {scheduled === 1 ? '1 aviso programado' : `${scheduled} avisos programados`}
            {push.syncFailed
              ? ' · pendiente de sincronizar'
              : push.syncedAt
                ? ` · sincronizado ${shortTime(timeOfInstant(push.syncedAt))}`
                : ''}
          </p>
          <button type="button" className="sheet__row" disabled={push.busy} onClick={() => void push.test()}>
            <IconBell size={18} />
            Enviar aviso de prueba
          </button>
          <button type="button" className="sheet__row" disabled={push.busy} onClick={() => void push.disable()}>
            <IconBellOff size={18} />
            Desactivar avisos
          </button>
        </>
      )}
    </>
  )
}
