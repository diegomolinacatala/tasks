import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { useToday } from '../../hooks/useToday'
import type { DeviceCredentials } from '../../lib/push/api'
import { PushApiError, createPushApi } from '../../lib/push/api'
import { currentSupport, disablePush, enablePush, loadDevice, refreshPush } from '../../lib/push/client'
import { encryptJson } from '../../lib/push/crypto'
import { clearDevice, ensureContentKey } from '../../lib/push/keystore'
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
  /** Última subida confirmada por el servidor en esta sesión. */
  syncedAt: number | null
  enable: () => Promise<void>
  disable: () => Promise<void>
  test: () => Promise<void>
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

  const { failed: syncFailed, syncedAt } = useScheduleSync({ api, device, state, today, onForgotten: forget })

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

  const test = useCallback(async () => {
    if (!api || !device) return
    setBusy(true)
    try {
      const key = await ensureContentKey()
      const payload = await encryptJson(key, { taskId: null, title: 'Tasks', body: 'Avisos activos', badge: null })
      await api.test(device.token, payload)
    } catch (error) {
      if (error instanceof PushApiError && (error.status === 401 || error.status === 410)) forget()
      toast({ message: messageOf(error, 'No se pudo enviar el aviso de prueba.') })
    } finally {
      setBusy(false)
    }
  }, [api, device, forget, toast])

  const value = useMemo(
    () => ({ status, busy, syncFailed, syncedAt, enable, disable, test }),
    [status, busy, syncFailed, syncedAt, enable, disable, test],
  )

  return <PushContext.Provider value={value}>{children}</PushContext.Provider>
}

export function usePush(): PushContextValue {
  const value = useContext(PushContext)
  if (!value) throw new Error('usePush debe usarse dentro de <PushProvider>')
  return value
}
