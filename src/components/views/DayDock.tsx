import { memo } from 'react'
import { createPortal } from 'react-dom'
import { useDroppable } from '@dnd-kit/core'
import { addDays, dayNameShort, dayNumber } from '../../lib/date'
import { useCopy } from '../../state/LanguageProvider'
import type { IsoDate } from '../../types'
import { dayDropId } from '../dnd/ids'
import './inbox.css'

const DOCK_DAYS = 7

const COPY = { es: { today: 'Hoy', tomorrow: 'Mañ' }, en: { today: 'Today', tomorrow: 'Tmrw' } } as const

interface DayDockProps {
  today: IsoDate
  open: boolean
}

/**
 * Mientras se arrastra una tarea de la Bandeja, suben los próximos siete días: soltarla en uno la
 * planifica para ese día. Como arrastrar un correo a una carpeta.
 */
export function DayDock({ today, open }: DayDockProps) {
  const copy = useCopy(COPY)
  const days = Array.from({ length: DOCK_DAYS }, (_, index) => addDays(today, index))
  return createPortal(
    <div className={`dock ${open ? 'is-open' : ''}`} aria-hidden={!open}>
      <div className="dock__panel">
        {days.map((date, index) => (
          <DockDay key={date} date={date} label={index === 0 ? copy.today : index === 1 ? copy.tomorrow : dayNameShort(date)} enabled={open} />
        ))}
      </div>
    </div>,
    document.body,
  )
}

const DockDay = memo(function DockDay({ date, label, enabled }: { date: IsoDate; label: string; enabled: boolean }) {
  const { setNodeRef, isOver } = useDroppable({ id: dayDropId(date), data: { type: 'day', date }, disabled: !enabled })
  return (
    <div ref={setNodeRef} className={`dock__day ${isOver ? 'is-over' : ''}`}>
      <span className="dock__label">{label}</span>
      <span className="dock__num">{dayNumber(date)}</span>
    </div>
  )
})
