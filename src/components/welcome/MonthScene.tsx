import { useMemo, useRef, useState } from 'react'
import { DndContext } from '@dnd-kit/core'
import { addDays, dayNameLong, dayNumber, monthLong, monthYear, nearLabel, todayIso } from '../../lib/date'
import type { IsoDate } from '../../types'
import { IconChevronDown } from '../ui/Icons'
import type { DayLoad } from '../views/StripDay'
import { WeekStrip } from '../views/WeekStrip'
import '../views/views.css'

/** Días con algo, contados desde hoy, para que la tira y el mes salgan con sus anillos. */
const SAMPLE: readonly (readonly [number, DayLoad])[] = [
  [-2, { total: 3, done: 3 }],
  [-1, { total: 2, done: 2 }],
  [0, { total: 4, done: 1 }],
  [1, { total: 2, done: 0 }],
  [3, { total: 3, done: 0 }],
  [6, { total: 1, done: 0 }],
  [10, { total: 2, done: 0 }],
  [15, { total: 1, done: 0 }],
]

const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1)

/**
 * La tira de la Agenda, la de verdad (`WeekStrip`): se tira de ella hacia abajo (o se toca el mes) y
 * se despliega; a los lados se pasa de mes, y elegir un día la recoge. Hasta que se toca, el asa se
 * mueve un poco para decir por dónde se coge.
 */
export function MonthScene() {
  const today = useMemo(() => todayIso(), [])
  const [day, setDay] = useState<IsoDate>(today)
  const [open, setOpen] = useState(false)
  const [touched, setTouched] = useState(false)
  const below = useRef<HTMLDivElement>(null)
  const loads = useMemo(() => new Map(SAMPLE.map(([offset, load]) => [addDays(today, offset), load])), [today])
  const near = nearLabel(day, today)

  return (
    <div className={`scene scene--month ${touched ? '' : 'is-hinting'}`} onPointerDownCapture={() => setTouched(true)}>
      <button
        type="button"
        className={`agenda__month ${open ? 'is-open' : ''}`}
        aria-expanded={open}
        aria-label={`${monthYear(day)}: ${open ? 'recoger el mes' : 'desplegar el mes'}`}
        onClick={() => setOpen((current) => !current)}
      >
        <span className="view__kicker">{monthYear(day)}</span>
        <IconChevronDown size={13} strokeWidth={2.2} />
      </button>
      {/* Los días de la tira son sitios donde soltar tareas: necesitan su contexto aunque aquí no se arrastre nada. */}
      <DndContext>
        <WeekStrip day={day} today={today} loads={loads} open={open} onOpenChange={setOpen} onSelect={setDay} follower={below} />
      </DndContext>
      <div ref={below} className="scene__below" aria-hidden="true">
        <p className="scene__day">
          {near ?? capitalize(dayNameLong(day))}{' '}
          <span>{near ? `${dayNameLong(day)} ${dayNumber(day)}` : `${dayNumber(day)} ${monthLong(day)}`}</span>
        </p>
        <i className="scene__ghost" />
        <i className="scene__ghost" />
        <i className="scene__ghost" />
      </div>
    </div>
  )
}
