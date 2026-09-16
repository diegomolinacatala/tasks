import { useCallback, useEffect, useRef, useState } from 'react'
import { RESCHEDULE_EVENT, nativePlan, planFingerprint } from '../../lib/nativeSchedule'
import { badgeCount } from '../../lib/schedule'
import type { AppState, IsoDate } from '../../types'

const SYNC_DEBOUNCE_MS = 400

/**
 * App nativa: reprograma las notificaciones locales (por hora y por lugar) tras cada cambio y
 * al volver a primer plano. Es idempotente: se aplica el plan entero, no el cambio suelto.
 */
export function useNativeSchedule(state: AppState, today: IsoDate, enabled: boolean) {
  const [failed, setFailed] = useState(false)
  const stateRef = useRef(state)
  const applied = useRef<string | null>(null)
  const running = useRef(false)
  const dirty = useRef(false)

  // En render y no en un efecto: al volver a primer plano hay que programar lo último.
  stateRef.current = state

  const sync = useCallback(async () => {
    if (!enabled) return
    if (running.current) {
      dirty.current = true
      return
    }
    running.current = true
    try {
      const { applyPlan } = await import('../../lib/platform/notifications')
      do {
        dirty.current = false
        const plan = nativePlan(stateRef.current, Date.now())
        const fingerprint = planFingerprint(plan)
        if (fingerprint === applied.current) continue
        await applyPlan(plan)
        applied.current = fingerprint
      } while (dirty.current)
      setFailed(false)
    } catch {
      // Se reintenta en el próximo cambio o al volver a la app.
      applied.current = null
      setFailed(true)
    } finally {
      running.current = false
    }
  }, [enabled])

  // Las secciones también cuentan: su nombre va en el cuerpo del aviso.
  useEffect(() => {
    const timer = setTimeout(() => void sync(), SYNC_DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [state.tasks, state.sections, state.places, state.settings, today, sync])

  useEffect(() => {
    // Con el paso del tiempo cambia el plan (los avisos pasados dejan hueco a los siguientes).
    const onVisibility = () => {
      if (document.visibilityState === 'visible') void sync()
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [sync])

  useEffect(() => {
    // El widget quita los avisos de lo que marca como hecho. Si después lo desmarca, el plan
    // es el mismo que había y la huella no bastaría para volver a programarlos.
    const onReschedule = () => {
      applied.current = null
      void sync()
    }
    window.addEventListener(RESCHEDULE_EVENT, onReschedule)
    return () => window.removeEventListener(RESCHEDULE_EVENT, onReschedule)
  }, [sync])

  useEffect(() => {
    if (!enabled) return
    const count = badgeCount(state.tasks, Date.now())
    void import('../../lib/platform/native')
      .then(({ TasksNative }) => TasksNative.setBadge({ count }))
      .catch(() => undefined)
  }, [state.tasks, today, enabled])

  return { failed }
}
