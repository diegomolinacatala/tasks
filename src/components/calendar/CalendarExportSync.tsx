import { useEffect, useRef, useSyncExternalStore } from 'react'
import { exportItems } from '../../lib/calendarExport'
import { useToday } from '../../hooks/useToday'
import { useAppState } from '../../state/StoreProvider'
import { useCalendar } from './CalendarProvider'

/** Varios cambios seguidos (tachar tres tareas) se mandan de una vez. */
const SYNC_DEBOUNCE_MS = 800

// Si la última vez no se pudo escribir en el calendario, Ajustes lo dice (puede fallar en segundo plano).
let exportFailed = false
const listeners = new Set<() => void>()
const setExportFailed = (failed: boolean) => {
  if (failed === exportFailed) return
  exportFailed = failed
  listeners.forEach((listener) => listener())
}
const subscribe = (listener: () => void) => {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
export const useExportFailed = (): boolean => useSyncExternalStore(subscribe, () => exportFailed)

/**
 * Las tareas con hora, al calendario elegido en Ajustes (`settings.calendar.export`): tras cada cambio,
 * la lista entera de lo que tiene que haber; `CalendarExport.swift` crea, cambia o borra lo justo. Con el
 * ajuste quitado, la lista va vacía y se borra lo que se había añadido. No pinta nada.
 */
export function CalendarExportSync() {
  const state = useAppState()
  const today = useToday()
  const { status, source } = useCalendar()
  const target = state.settings.calendar.export
  const sent = useRef<string | null>(null)

  useEffect(() => {
    if (!source || status !== 'granted') return
    const items = target ? exportItems(state.tasks, Date.now()) : []
    const key = JSON.stringify([target, items])
    if (key === sent.current) return
    const timer = window.setTimeout(() => {
      sent.current = key
      void source.syncTasks(target, items).then(
        () => setExportFailed(false),
        () => {
          // Se reintenta con el próximo cambio.
          sent.current = null
          setExportFailed(true)
        },
      )
    }, SYNC_DEBOUNCE_MS)
    return () => window.clearTimeout(timer)
  }, [source, status, state.tasks, target, today])

  return null
}
