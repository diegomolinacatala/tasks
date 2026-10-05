import { useState } from 'react'
import { addDays, relativeLabel, shortTime } from '../../lib/date'
import { untilLabel } from '../../lib/period'
import { createId } from '../../lib/id'
import { useCopy } from '../../state/LanguageProvider'
import { useAppState, useDispatch } from '../../state/StoreProvider'
import { sortedSections } from '../../state/selectors'
import type { IsoDate, IsoTime } from '../../types'
import { IconClose } from '../ui/Icons'
import { PickerChip } from '../ui/PickerChip'

/**
 * Los campos de una tarea que comparten el panel de la tarea y la ficha del compositor. No guardan
 * nada: dicen lo elegido con `onChange` y cada uno decide qué hacer con ello.
 */

const COPY = {
  es: {
    when: 'Cuándo',
    today: 'Hoy',
    tomorrow: 'Mañana',
    noDate: 'Sin fecha',
    otherDay: 'Otro día',
    until: 'Hasta…',
    clearUntil: 'Quitar el plazo: solo ese día',
    time: 'Hora',
    noTime: 'Sin hora',
    pickTime: 'Elegir hora',
    section: 'Sección',
    none: 'Ninguna',
    add: '+ Nueva',
    name: 'Nombre',
  },
  en: {
    when: 'When',
    today: 'Today',
    tomorrow: 'Tomorrow',
    noDate: 'No date',
    otherDay: 'Other day',
    until: 'Until…',
    clearUntil: 'Remove the time frame: just that day',
    time: 'Time',
    noTime: 'No time',
    pickTime: 'Pick a time',
    section: 'Section',
    none: 'None',
    add: '+ New',
    name: 'Name',
  },
} as const

interface WhenFieldProps {
  date: IsoDate | null
  today: IsoDate
  onChange: (date: IsoDate | null) => void
  /** Último día del plazo (`lib/period.ts`). Sin `onUntil`, el campo no lo ofrece. */
  until?: IsoDate | null
  onUntil?: (until: IsoDate | null) => void
}

/**
 * El día y, con él, hasta cuándo vale: "Hasta…" lo convierte en un plazo (se ve cada día hasta hacerla
 * y no queda atrasada antes de tiempo). Elegido, dice "Hasta el viernes" y la × lo quita.
 */
export function WhenField({ date, today, onChange, until = null, onUntil }: WhenFieldProps) {
  const tomorrow = addDays(today, 1)
  const copy = useCopy(COPY)
  const isCustomDate = Boolean(date && date !== today && date !== tomorrow)
  return (
    <>
      <p className="sheet__title">{copy.when}</p>
      <div className="sheet__chips">
        <button type="button" className={`chip ${date === today ? 'is-active' : ''}`} onClick={() => onChange(today)}>
          {copy.today}
        </button>
        <button type="button" className={`chip ${date === tomorrow ? 'is-active' : ''}`} onClick={() => onChange(tomorrow)}>
          {copy.tomorrow}
        </button>
        <button type="button" className={`chip ${date === null ? 'is-active' : ''}`} onClick={() => onChange(null)}>
          {copy.noDate}
        </button>
        <PickerChip type="date" className={`chip ${isCustomDate ? 'is-active' : ''}`} value={date ?? ''} onCommit={(value) => onChange(value || null)}>
          {isCustomDate && date ? relativeLabel(date, today) : copy.otherDay}
        </PickerChip>
        {date !== null && onUntil && (
          <PickerChip
            type="date"
            className={`chip ${until ? 'chip--reminder chip--until' : 'chip--option'}`}
            value={until ?? ''}
            min={addDays(date, 1)}
            onCommit={(value) => onUntil(value || null)}
          >
            {until ? untilLabel(until, today) : copy.until}
            {until && (
              <button
                type="button"
                className="chip__clear"
                aria-label={copy.clearUntil}
                onClick={(event) => {
                  // Dentro de la píldora: quitarlo no debe abrir también el selector.
                  event.preventDefault()
                  event.stopPropagation()
                  onUntil(null)
                }}
              >
                <IconClose size={12} className="chip__remove" />
              </button>
            )}
          </PickerChip>
        )}
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

export function TimeField({ time, onChange, title, noneLabel }: TimeFieldProps) {
  const copy = useCopy(COPY)
  return (
    <>
      <p className="sheet__title">{title ?? copy.time}</p>
      <div className="sheet__chips">
        <button type="button" className={`chip ${time === null ? 'is-active' : ''}`} onClick={() => onChange(null)}>
          {noneLabel ?? copy.noTime}
        </button>
        <PickerChip type="time" className={`chip ${time ? 'is-active' : ''}`} value={time ?? ''} onCommit={(value) => onChange(value || null)}>
          {time ? shortTime(time) : copy.pickTime}
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
  const copy = useCopy(COPY)
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
      <p className="sheet__title">{copy.section}</p>
      <div className="sheet__chips">
        <button type="button" className={`chip ${sectionId === null ? 'is-active' : ''}`} onClick={() => onChange(null)}>
          {copy.none}
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
            {copy.add}
          </button>
        ) : (
          <input
            className="chip"
            autoFocus
            placeholder={copy.name}
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
