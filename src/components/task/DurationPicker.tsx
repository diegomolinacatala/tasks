import { shortTime } from '../../lib/date'
import { DURATION_PRESETS, durationFromEnd, durationLabel, endClock } from '../../lib/duration'
import { useDispatch } from '../../state/StoreProvider'
import type { IsoTime, Task } from '../../types'

interface DurationPickerProps {
  /** Solo se pinta con hora: sin ella no hay desde cuándo contar ni cuándo preguntar. */
  task: Task & { time: IsoTime }
}

/**
 * Cuánto dura la tarea, en atajos o eligiendo a qué hora acaba. Al acabar llega el aviso que
 * pregunta si ya está hecha, así que la línea de abajo dice a qué hora será.
 */
export function DurationPicker({ task }: DurationPickerProps) {
  const dispatch = useDispatch()
  const { duration } = task
  const set = (minutes: number | null) => dispatch({ type: 'task/setDuration', id: task.id, duration: minutes })
  const isPreset = duration !== null && DURATION_PRESETS.some((preset) => preset === duration)
  const end = duration === null ? null : endClock(task.time, duration)

  return (
    <>
      <p className="sheet__title">Duración</p>
      <div className="sheet__chips">
        <button type="button" className={`chip ${duration === null ? 'is-active' : ''}`} onClick={() => set(null)}>
          Sin duración
        </button>
        {DURATION_PRESETS.map((minutes) => (
          <button
            key={minutes}
            type="button"
            className={`chip ${duration === minutes ? 'is-active' : ''}`}
            onClick={() => set(minutes)}
          >
            {durationLabel(minutes)}
          </button>
        ))}
        <label className={`chip ${end && !isPreset ? 'is-active' : ''}`}>
          {end && !isPreset ? `Hasta ${shortTime(end)}` : 'Hasta…'}
          <input
            type="time"
            className="sr-only"
            value={end ?? ''}
            onChange={(event) => {
              // Acabar a la hora de empezar sería un toque en falso: daría la vuelta al reloj.
              const value = event.target.value
              if (value && value !== task.time) set(durationFromEnd(task.time, value))
            }}
          />
        </label>
      </div>
      {end && !task.done && <p className="sheet__note">A las {shortTime(end)} te pregunto si has acabado.</p>}
    </>
  )
}
