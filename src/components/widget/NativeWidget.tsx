import { useCallback, useEffect, useRef, useState } from 'react'
import type { CalendarEvent } from '../../lib/calendar'
import { addDays, fromIso } from '../../lib/date'
import { WIDGET_EVENT, parseRoutineChanges, parseWidgetChanges } from '../../lib/nativeEvents'
import { RESCHEDULE_EVENT } from '../../lib/nativeSchedule'
import { TasksNative } from '../../lib/platform/native'
import { routineSettles, widgetSnapshot, widgetToggles } from '../../lib/widget'
import { useLanguage } from '../../state/LanguageProvider'
import { useAppState, useDispatch } from '../../state/StoreProvider'
import type { IsoDate } from '../../types'
import { useCalendar } from '../calendar/CalendarProvider'

const SYNC_DEBOUNCE_MS = 400

interface NativeWidgetProps {
  today: IsoDate
}

/**
 * Widgets (solo iPhone): el de hoy, el de la Bandeja y el de rutinas. La app
 * les deja una foto de las tareas y las rutinas en el App Group y, al volver a primer plano, aplica
 * lo que se haya marcado desde ellos (o desde el botón "Hecha" del aviso de una rutina). No pinta nada.
 */
export function NativeWidget({ today }: NativeWidgetProps) {
  const state = useAppState()
  const dispatch = useDispatch()
  // Los textos del widget van en el idioma de la app: cambiarlo reescribe la foto.
  const language = useLanguage()
  const stateRef = useRef(state)
  const written = useRef<string | null>(null)
  // La semana del calendario del iPhone, si se enseña: el widget la lee él mismo, pero la foto lleva una
  // copia por si no pudiera.
  const calendar = useCalendar()
  const [events, setEvents] = useState<CalendarEvent[] | null>(null)
  const eventsRef = useRef(events)
  const hiddenKey = state.settings.calendar.hidden.join(',')

  useEffect(() => {
    stateRef.current = state
  }, [state])

  useEffect(() => {
    eventsRef.current = events
  }, [events])

  useEffect(() => {
    const { source, active } = calendar
    if (!source || !active) {
      setEvents(null)
      return
    }
    let alive = true
    const from = fromIso(today).getTime()
    const to = fromIso(addDays(today, 9)).getTime()
    void source.events(from, to, stateRef.current.settings.calendar.hidden).then((found) => alive && setEvents(found), () => undefined)
    return () => {
      alive = false
    }
  }, [calendar.source, calendar.active, calendar.revision, today, hiddenKey]) // eslint-disable-line react-hooks/exhaustive-deps

  const write = useCallback(async () => {
    const json = JSON.stringify(widgetSnapshot(stateRef.current, Date.now(), eventsRef.current))
    if (json === written.current) return
    written.current = json
    try {
      await TasksNative.syncWidget({ json })
    } catch {
      // Se reintenta en el próximo cambio.
      written.current = null
    }
  }, [])

  const pull = useCallback(async () => {
    try {
      const { changes, reschedule } = await TasksNative.widgetChanges()
      widgetToggles(stateRef.current.tasks, parseWidgetChanges(changes)).forEach((id) => dispatch({ type: 'task/toggle', id }))
      // Rutinas tachadas en la pantalla de bloqueo o desde su aviso.
      routineSettles(stateRef.current.routines, parseRoutineChanges(changes)).forEach(({ routineId, date, done }) =>
        dispatch({ type: 'routine/set', id: routineId, date, done }),
      )
      if (reschedule) window.dispatchEvent(new Event(RESCHEDULE_EVENT))
    } catch {
      // Sin App Group (compilación sin firmar) no hay widget del que leer.
    }
  }, [dispatch])

  useEffect(() => {
    const timer = setTimeout(() => void write(), SYNC_DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [state.tasks, state.sections, state.routines, state.settings.calendar, events, today, language, write])

  useEffect(() => {
    void pull()
    // Al salir se escribe ya: iOS congela la app enseguida y el widget se quedaría atrás.
    const onVisibility = () => void (document.visibilityState === 'visible' ? pull() : write())
    document.addEventListener('visibilitychange', onVisibility)
    // Con la app delante también llegan cambios de fuera: el "Hecha" del aviso de una rutina.
    const onChanges = () => void pull()
    window.addEventListener(WIDGET_EVENT, onChanges)
    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener(WIDGET_EVENT, onChanges)
    }
  }, [pull, write])

  return null
}
