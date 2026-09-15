import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { useToday } from '../../hooks/useToday'
import { timeOfInstant, todayIso } from '../../lib/date'
import type { DeviceCredentials } from '../../lib/push/api'
import { PushApiError, createPushApi } from '../../lib/push/api'
import { currentSupport, disablePush, enablePush, loadDevice, refreshPush } from '../../lib/push/client'
import { clearDevice } from '../../lib/push/keystore'
import { useAppState } from '../../state/StoreProvider'
import { useToast } from '../ui/Toast'
import type { PushStatus } from './pushContext'
import { PushContext } from './pushContext'
import { useScheduleSync } from './useScheduleSync'

export { usePush } from './pushContext'
export type { PushStatus } from './pushContext'

const API_URL = import.meta.env.VITE_PUSH_API

function initialStatus(): PushStatus {
  if (!API_URL) return 'unconfigured'
  const support = currentSupport()
  if (support !== 'ready') return support
  return Notification.permission === 'denied' ? 'denied' : 'off'
}

const messageOf = (error: unknown, fallback: string) =>
  error instanceof PushApiError || error instanceof Error ? error.message : fallback

export function PushProvider({ children }: { children: ReactNode }) {
  const state = useAppState()
  const today = useToday()
  const toast = useToast()
  const api = useMemo(() => (API_URL ? createPushApi(API_URL) : null), [])
  const [status, setStatus] = useState<PushStatus>(initialStatus)
  const [device, setDevice] = useState<DeviceCredentials | null>(null)
  const [busy, setBusy] = useState(false)

  const forget = useCallback(() => {
    void clearDevice()
    setDevice(null)
    setStatus('off')
  }, [])

  const { failed: syncFailed } = useScheduleSync({ api, device, state, today, onForgotten: forget })

  useEffect(() => {
    if (!api || status !== 'off') return
    let cancelled = false
    const restore = async () => {
      try {
        const restored = await refreshPush(api)
        if (cancelled || !restored) return
        setDevice(restored)
        setStatus('on')
      } catch {
        // Sin conexión al abrir: se sigue con el dispositivo guardado y se sincroniza más tarde.
        const stored = await loadDevice()
        if (cancelled || !stored || Notification.permission !== 'granted') return
        setDevice(stored)
        setStatus('on')
      }
    }
    void restore()
    return () => {
      cancelled = true
    }
    // Solo al arrancar: después el estado lo gobiernan enable/disable.
  }, [api]) // eslint-disable-line react-hooks/exhaustive-deps

  const enable = useCallback(async () => {
    if (!api) return
    setBusy(true)
    try {
      const created = await enablePush(api)
      if (!created) {
        setStatus(Notification.permission === 'denied' ? 'denied' : 'off')
        return
      }
      setDevice(created)
      setStatus('on')
    } catch (error) {
      toast({ message: messageOf(error, 'No se pudieron activar los avisos.') })
    } finally {
      setBusy(false)
    }
  }, [api, toast])

  const disable = useCallback(async () => {
    if (!api) return
    setBusy(true)
    try {
      await disablePush(api)
      setDevice(null)
      setStatus('off')
    } catch (error) {
      toast({ message: messageOf(error, 'No se pudieron desactivar los avisos.') })
    } finally {
      setBusy(false)
    }
  }, [api, toast])

  const transcribe = useCallback(
    async (audio: string, signal?: AbortSignal) => {
      if (!api || !device) throw new Error('Activa los avisos en Ajustes para dictar tareas.')
      try {
        const now = Date.now()
        const context = { today: todayIso(new Date(now)), now: timeOfInstant(now) }
        return await api.transcribe(device.token, audio, context, { signal })
      } catch (error) {
        if (error instanceof PushApiError && error.status === 401) forget()
        if (error instanceof PushApiError && error.status === 404) {
          throw new Error('El servidor aún no tiene el dictado: vuelve a desplegar el Worker.')
        }
        throw error
      }
    },
    [api, device, forget],
  )

  const value = useMemo(
    () => ({ status, busy, syncFailed, enable, disable, canTranscribe: status === 'on', transcribe }),
    [status, busy, syncFailed, enable, disable, transcribe],
  )

  return <PushContext.Provider value={value}>{children}</PushContext.Provider>
}
