import { useCallback, useEffect, useRef, useState } from 'react'
import { badgeCount, upcomingSchedule } from '../../lib/reminders'
import type { DeviceCredentials, PushApi } from '../../lib/push/api'
import { PushApiError } from '../../lib/push/api'
import { ensureContentKey } from '../../lib/push/keystore'
import { encryptSchedule, scheduleFingerprint } from '../../lib/push/sync'
import type { AppState, IsoDate } from '../../types'

/** Corto a propósito: iOS congela la página en cuanto sales de la app. */
const SYNC_DEBOUNCE_MS = 600

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
  const [syncedAt, setSyncedAt] = useState<number | null>(null)
  const stateRef = useRef(state)
  const lastFingerprint = useRef<string | null>(null)
  const running = useRef(false)
  const dirty = useRef(false)
  const leaving = useRef(false)

  // Se actualiza en render y no en un efecto: al salir de la app hay que subir lo último.
  stateRef.current = state

  useEffect(() => {
    lastFingerprint.current = null
  }, [device])

  const sync = useCallback(
    async (keepalive = false) => {
      if (!api || !device) return
      leaving.current = leaving.current || keepalive
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
          const items = await encryptSchedule(key, entries)
          await api.putSchedule(device.token, items, { keepalive: leaving.current })
          lastFingerprint.current = fingerprint
        } while (dirty.current)
        setFailed(false)
        setSyncedAt(Date.now())
      } catch (error) {
        if (error instanceof PushApiError && error.status === 401) {
          onForgotten()
          return
        }
        // Se reintenta en el próximo cambio, al volver a primer plano o al recuperar conexión.
        setFailed(true)
      } finally {
        running.current = false
        leaving.current = false
      }
    },
    [api, device, onForgotten],
  )

  useEffect(() => {
    if (!device) return
    const timer = setTimeout(() => void sync(), SYNC_DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [state.tasks, device, sync])

  useEffect(() => {
    const onVisibility = () => {
      // Al salir se sube ya, sin esperar al debounce, con una petición que sobrevive al cierre.
      void sync(document.visibilityState === 'hidden')
    }
    const onOnline = () => void sync()
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('pagehide', onVisibility)
    window.addEventListener('online', onOnline)
    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('pagehide', onVisibility)
      window.removeEventListener('online', onOnline)
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

  return { failed, syncedAt }
}
