import { useEffect, useRef } from 'react'
import { exportItems } from '../../lib/calendarExport'
import { useToday } from '../../hooks/useToday'
import { useAppState } from '../../state/StoreProvider'
import { useCalendar } from './CalendarProvider'

/** Varios cambios seguidos (tachar tres tareas) se mandan de una vez. */
const SYNC_DEBOUNCE_MS = 800

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
      void source.syncTasks(target, items).catch(() => {
        // Se reintenta con el próximo cambio.
        sent.current = null
      })
    }, SYNC_DEBOUNCE_MS)
    return () => window.clearTimeout(timer)
  }, [source, status, state.tasks, target, today])

  return null
}
