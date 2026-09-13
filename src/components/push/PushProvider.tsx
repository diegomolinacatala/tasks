import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { useToday } from '../../hooks/useToday'
import type { DeviceCredentials } from '../../lib/push/api'
import { PushApiError, createPushApi } from '../../lib/push/api'
import { currentSupport, disablePush, enablePush, loadDevice, refreshPush } from '../../lib/push/client'
import { clearDevice } from '../../lib/push/keystore'
import { useAppState } from '../../state/StoreProvider'
import { useToast } from '../ui/Toast'
import { useScheduleSync } from './useScheduleSync'

/**
 * `unconfigured`: build sin servidor de avisos.
 * `needs-install`: iPhone sin instalar en la pantalla de inicio.
 */
export type PushStatus = 'unconfigured' | 'unsupported' | 'needs-install' | 'denied' | 'off' | 'on'

interface PushContextValue {
  status: PushStatus
  busy: boolean
  syncFailed: boolean
  enable: () => Promise<void>
  disable: () => Promise<void>
  /** Voz a texto en el servidor. Requiere los avisos activados: usa el token del dispositivo. */
  transcribe: (audio: string) => Promise<string>
}

const PushContext = createContext<PushContextValue | null>(null)

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
    async (audio: string) => {
      if (!api || !device) throw new Error('Activa los avisos en Ajustes para dictar tareas.')
      try {
        return await api.transcribe(device.token, audio)
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
    () => ({ status, busy, syncFailed, enable, disable, transcribe }),
    [status, busy, syncFailed, enable, disable, transcribe],
  )

  return <PushContext.Provider value={value}>{children}</PushContext.Provider>
}

export function usePush(): PushContextValue {
  const value = useContext(PushContext)
  if (!value) throw new Error('usePush debe usarse dentro de <PushProvider>')
  return value
}
