import { useCallback, useEffect, useRef } from 'react'
import { WIDGET_EVENT, parseRoutineChanges, parseWidgetChanges } from '../../lib/nativeEvents'
import { RESCHEDULE_EVENT } from '../../lib/nativeSchedule'
import { TasksNative } from '../../lib/platform/native'
import { routineSettles, widgetSnapshot, widgetToggles } from '../../lib/widget'
import { useAppState, useDispatch } from '../../state/StoreProvider'
import type { IsoDate } from '../../types'

const SYNC_DEBOUNCE_MS = 400

interface NativeWidgetProps {
  today: IsoDate
}

/**
 * Widgets (solo iPhone): el de hoy en la pantalla de inicio y el de rutinas en la de bloqueo. La app
 * les deja una foto de las tareas y las rutinas en el App Group y, al volver a primer plano, aplica
 * lo que se haya marcado desde ellos (o desde el botón "Hecha" del aviso de una rutina). No pinta nada.
 */
export function NativeWidget({ today }: NativeWidgetProps) {
  const state = useAppState()
  const dispatch = useDispatch()
  const stateRef = useRef(state)
  const written = useRef<string | null>(null)

  useEffect(() => {
    stateRef.current = state
  }, [state])

  const write = useCallback(async () => {
    const json = JSON.stringify(widgetSnapshot(stateRef.current, Date.now()))
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
  }, [state.tasks, state.sections, state.routines, today, write])

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
