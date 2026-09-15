import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { useToday } from '../../hooks/useToday'
import { timeOfInstant, todayIso } from '../../lib/date'
import type { DeviceCredentials, PushApi } from '../../lib/push/api'
import { PushApiError, createPushApi } from '../../lib/push/api'
import { clearDevice, loadDevice, saveDevice } from '../../lib/push/keystore'
import type { PermissionStatus } from '../../lib/platform/native'
import { useAppState } from '../../state/StoreProvider'
import { useToast } from '../ui/Toast'
import type { PushStatus } from './pushContext'
import { PushContext } from './pushContext'
import { useNativeSchedule } from './useNativeSchedule'

const API_URL = import.meta.env.VITE_PUSH_API
/** El permiso se pide solo una vez por instalación; después manda lo que diga Ajustes de iOS. */
const ASKED_KEY = 'tasks:notifications-asked'

const statusOf = (permission: PermissionStatus): PushStatus =>
  permission === 'granted' ? 'on' : permission === 'denied' ? 'denied' : 'off'

async function voiceDevice(api: PushApi, forceNew: boolean): Promise<DeviceCredentials> {
  if (!forceNew) {
    const stored = await loadDevice()
    if (stored) return stored
  }
  await clearDevice()
  const created = await api.registerVoice()
  await saveDevice(created)
  return created
}

/**
 * Avisos de la app de iPhone: notificaciones locales programadas en el propio móvil (por hora y
 * por lugar), sin servidor. El servidor solo se usa para dictar.
 */
export function NativePushProvider({ children }: { children: ReactNode }) {
  const state = useAppState()
  const today = useToday()
  const toast = useToast()
  const api = useMemo(() => (API_URL ? createPushApi(API_URL) : null), [])
  const [status, setStatus] = useState<PushStatus>('off')
  const [busy, setBusy] = useState(false)
  const { failed: syncFailed } = useNativeSchedule(state, today, status === 'on')

  useEffect(() => {
    // El permiso se puede cambiar en Ajustes de iOS con la app en segundo plano.
    const refresh = () => {
      void import('../../lib/platform/notifications')
        .then(({ notificationPermission }) => notificationPermission())
        .then((permission) => setStatus(statusOf(permission)))
        .catch(() => undefined)
    }
    refresh()
    const onVisibility = () => {
      if (document.visibilityState === 'visible') refresh()
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [])

  const enable = useCallback(async () => {
    setBusy(true)
    try {
      const { requestNotificationPermission } = await import('../../lib/platform/notifications')
      setStatus(statusOf(await requestNotificationPermission()))
    } catch {
      toast({ message: 'No se pudieron activar los avisos.' })
    } finally {
      setBusy(false)
    }
  }, [toast])

  // La primera vez que hay algo que avisar se pide el permiso: en la app nativa iOS lo admite sin gesto.
  const hasReminders = state.tasks.some((task) => !task.done && task.reminders.length > 0)
  useEffect(() => {
    if (status !== 'off' || !hasReminders) return
    try {
      if (localStorage.getItem(ASKED_KEY)) return
      localStorage.setItem(ASKED_KEY, '1')
    } catch {
      return
    }
    void enable()
  }, [status, hasReminders, enable])

  const disable = useCallback(async () => {
    const { TasksNative } = await import('../../lib/platform/native')
    await TasksNative.openSettings()
  }, [])

  const transcribe = useCallback(
    async (audio: string, signal?: AbortSignal) => {
      if (!api) throw new Error('El dictado no está disponible en esta versión.')
      const now = Date.now()
      const context = { today: todayIso(new Date(now)), now: timeOfInstant(now) }
      const device = await voiceDevice(api, false)
      try {
        return await api.transcribe(device.token, audio, context, { signal })
      } catch (error) {
        // El servidor olvidó el dispositivo (limpieza o base de datos nueva): alta y un reintento.
        if (!(error instanceof PushApiError && error.status === 401)) throw error
        const renewed = await voiceDevice(api, true)
        return api.transcribe(renewed.token, audio, context, { signal })
      }
    },
    [api],
  )

  const value = useMemo(
    () => ({ status, busy, syncFailed, enable, disable, canTranscribe: api !== null, transcribe }),
    [status, busy, syncFailed, enable, disable, api, transcribe],
  )

  return <PushContext.Provider value={value}>{children}</PushContext.Provider>
}
