import { useCallback, useEffect, useRef, useState } from 'react'
import { badgeCount, upcomingSchedule } from '../../lib/reminders'
import type { DeviceCredentials, PushApi } from '../../lib/push/api'
import { PushApiError } from '../../lib/push/api'
import { ensureContentKey } from '../../lib/push/keystore'
import { encryptSchedule, scheduleFingerprint } from '../../lib/push/sync'
import type { AppState, IsoDate } from '../../types'

const SYNC_DEBOUNCE_MS = 2000

interface SyncOptions {
  api: PushApi | null
  device: DeviceCredentials | null
  state: AppState
  today: IsoDate
  /** El servidor ya no reconoce el dispositivo. */
  onForgotten: () => void
}

/**
 * Sube la agenda completa de avisos futuros tras cada cambio. Es idempotente: editar,
 * completar, borrar o importar se resuelve volviendo a subirla entera.
 */
export function useScheduleSync({ api, device, state, today, onForgotten }: SyncOptions) {
  const [failed, setFailed] = useState(false)
  const stateRef = useRef(state)
  const lastFingerprint = useRef<string | null>(null)
  const running = useRef(false)
  const dirty = useRef(false)

  useEffect(() => {
    stateRef.current = state
  }, [state])

  useEffect(() => {
    lastFingerprint.current = null
  }, [device])

  const sync = useCallback(async () => {
    if (!api || !device) return
    if (running.current) {
      // Llegó un cambio con otra subida en curso: se repite al terminar.
      dirty.current = true
      return
    }
    running.current = true
    try {
      do {
        dirty.current = false
        const entries = upcomingSchedule(stateRef.current, Date.now())
        const fingerprint = await scheduleFingerprint(device.deviceId, entries)
        if (fingerprint === lastFingerprint.current) continue
        const key = await ensureContentKey()
        await api.putSchedule(device.token, await encryptSchedule(key, entries))
        lastFingerprint.current = fingerprint
      } while (dirty.current)
      setFailed(false)
    } catch (error) {
      if (error instanceof PushApiError && error.status === 401) {
        onForgotten()
        return
      }
      // Se reintenta en el próximo cambio, al volver a primer plano o al recuperar conexión.
      setFailed(true)
    } finally {
      running.current = false
    }
  }, [api, device, onForgotten])

  useEffect(() => {
    if (!device) return
    const timer = setTimeout(() => void sync(), SYNC_DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [state.tasks, device, sync])

  useEffect(() => {
    const wake = () => {
      if (document.visibilityState === 'visible') void sync()
    }
    document.addEventListener('visibilitychange', wake)
    window.addEventListener('online', wake)
    return () => {
      document.removeEventListener('visibilitychange', wake)
      window.removeEventListener('online', wake)
    }
  }, [sync])

  // Número en el icono: pendientes de hoy más atrasadas.
  useEffect(() => {
    if (!('setAppBadge' in navigator)) return
    const count = badgeCount(state.tasks, Date.now())
    const update = count > 0 ? navigator.setAppBadge(count) : navigator.clearAppBadge()
    // Sin permiso de notificaciones iOS rechaza el badge; no hay nada que hacer.
    update.catch(() => undefined)
  }, [state.tasks, today])

  return { failed }
}
