import { useState } from 'react'
import { addDays, relativeLabel, shortTime } from '../../lib/date'
import { createId } from '../../lib/id'
import { useAppState, useDispatch } from '../../state/StoreProvider'
import { sortedSections } from '../../state/selectors'
import type { IsoDate, IsoTime } from '../../types'
import { PickerChip } from '../ui/PickerChip'

/**
 * Los campos de una tarea que comparten el panel de la tarea y la ficha del compositor. No guardan
 * nada: dicen lo elegido con `onChange` y cada uno decide qué hacer con ello.
 */

interface WhenFieldProps {
  date: IsoDate | null
  today: IsoDate
  onChange: (date: IsoDate | null) => void
}

export function WhenField({ date, today, onChange }: WhenFieldProps) {
  const tomorrow = addDays(today, 1)
  const isCustomDate = Boolean(date && date !== today && date !== tomorrow)
  return (
    <>
      <p className="sheet__title">Cuándo</p>
      <div className="sheet__chips">
        <button type="button" className={`chip ${date === today ? 'is-active' : ''}`} onClick={() => onChange(today)}>
          Hoy
        </button>
        <button type="button" className={`chip ${date === tomorrow ? 'is-active' : ''}`} onClick={() => onChange(tomorrow)}>
          Mañana
        </button>
        <button type="button" className={`chip ${date === null ? 'is-active' : ''}`} onClick={() => onChange(null)}>
          Sin fecha
        </button>
        <PickerChip type="date" className={`chip ${isCustomDate ? 'is-active' : ''}`} value={date ?? ''} onCommit={(value) => onChange(value || null)}>
          {isCustomDate && date ? relativeLabel(date, today) : 'Otro día'}
        </PickerChip>
      </div>
    </>
  )
}

interface TimeFieldProps {
  time: IsoTime | null
  onChange: (time: IsoTime | null) => void
  /** En una rutina la hora es la del aviso de cada día: "Aviso" y "Sin aviso", como en su panel. */
  title?: string
  noneLabel?: string
}

export function TimeField({ time, onChange, title = 'Hora', noneLabel = 'Sin hora' }: TimeFieldProps) {
  return (
    <>
      <p className="sheet__title">{title}</p>
      <div className="sheet__chips">
        <button type="button" className={`chip ${time === null ? 'is-active' : ''}`} onClick={() => onChange(null)}>
          {noneLabel}
        </button>
        <PickerChip type="time" className={`chip ${time ? 'is-active' : ''}`} value={time ?? ''} onCommit={(value) => onChange(value || null)}>
          {time ? shortTime(time) : 'Elegir hora'}
        </PickerChip>
      </div>
    </>
  )
}

interface SectionFieldProps {
  sectionId: string | null
  onChange: (sectionId: string | null) => void
}

/** Las secciones agrupan dentro del día; "+ Nueva" la crea y la elige a la vez. */
export function SectionField({ sectionId, onChange }: SectionFieldProps) {
  const state = useAppState()
  const dispatch = useDispatch()
  const sections = sortedSections(state)
  const [draft, setDraft] = useState<string | null>(null)

  const create = (name: string) => {
    if (!name.trim()) return
    const id = createId()
    dispatch({ type: 'section/add', name, id })
    onChange(id)
    setDraft(null)
  }

  return (
    <>
      <p className="sheet__title">Sección</p>
      <div className="sheet__chips">
        <button type="button" className={`chip ${sectionId === null ? 'is-active' : ''}`} onClick={() => onChange(null)}>
          Ninguna
        </button>
        {sections.map((section) => (
          <button
            key={section.id}
            type="button"
            className={`chip ${sectionId === section.id ? 'is-active' : ''}`}
            onClick={() => onChange(section.id)}
          >
            {section.name}
          </button>
        ))}
        {draft === null ? (
          <button type="button" className="chip" onClick={() => setDraft('')}>
            + Nueva
          </button>
        ) : (
          <input
            className="chip"
            autoFocus
            placeholder="Nombre"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onBlur={() => setDraft(null)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') create(draft)
              if (event.key === 'Escape') setDraft(null)
            }}
          />
        )}
      </div>
    </>
  )
}
