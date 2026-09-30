import { memo } from 'react'
import type { CSSProperties } from 'react'
import { useDroppable } from '@dnd-kit/core'
import { dayNumber, fullLabel } from '../../lib/date'
import type { IsoDate } from '../../types'
import { dayDropId } from '../dnd/ids'

/** Lo que hay cada día: el anillo de avance y el aviso de lo que quedó sin hacer. */
export interface DayLoad {
  total: number
  done: number
}

interface StripDayProps {
  date: IsoDate
  selected: boolean
  isToday: boolean
  past: boolean
  /** Con el mes desplegado: un día del mes de antes o del de después, que asoma atenuado. */
  outside: boolean
  load: DayLoad
  /** Solo los días que se ven: los de los lados no reciben tareas ni el foco del teclado. */
  droppable: boolean
  onSelect: (date: IsoDate) => void
}

const RING = 2 * Math.PI * 16

/**
 * Un día de la tira (o del mes): su número y un anillo que se cierra con lo hecho; lo pasado con
 * pendientes, en ladrillo. Soltar aquí una tarea arrastrada la lleva a ese día.
 */
export const StripDay = memo(function StripDay({ date, selected, isToday, past, outside, load, droppable, onSelect }: StripDayProps) {
  const { setNodeRef, isOver } = useDroppable({ id: dayDropId(date), data: { type: 'day', date }, disabled: !droppable })
  const pending = load.total - load.done
  const ratio = load.total ? load.done / load.total : 0
  const late = past && pending > 0

  return (
    <button
      ref={setNodeRef}
      type="button"
      tabIndex={droppable ? 0 : -1}
      className={`strip__day ${selected ? 'is-selected' : ''} ${isToday ? 'is-today' : ''} ${late ? 'is-late' : ''} ${
        outside ? 'is-outside' : ''
      } ${isOver ? 'is-over' : ''}`}
      aria-pressed={selected}
      aria-current={isToday ? 'date' : undefined}
      aria-label={`${isToday ? 'Hoy, ' : ''}${fullLabel(date)}${load.total ? `, ${load.done} de ${load.total} hechas` : ''}`}
      onClick={() => onSelect(date)}
    >
      <span className="strip__num" style={{ '--ring': ratio } as CSSProperties}>
        <svg viewBox="0 0 36 36" aria-hidden="true">
          {load.total > 0 && <circle className="strip__track-ring" cx="18" cy="18" r="16" />}
          {load.done > 0 && (
            <circle className="strip__ring" cx="18" cy="18" r="16" strokeDasharray={`${RING * ratio} ${RING}`} transform="rotate(-90 18 18)" />
          )}
        </svg>
        <span className="strip__digit">{dayNumber(date)}</span>
      </span>
    </button>
  )
})
