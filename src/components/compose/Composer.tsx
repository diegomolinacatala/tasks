import { useMemo, useState } from 'react'
import type { FormEvent, KeyboardEvent } from 'react'
import { parseTask } from '../../lib/parse'
import type { IsoDate, IsoTime, ReminderDraft } from '../../types'
import { IconBell, IconPlus } from '../ui/Icons'
import './composer.css'

export interface TaskDraft {
  title: string
  date: IsoDate | null
  time: IsoTime | null
  reminders: ReminderDraft[]
}

interface ComposerProps {
  /** Atajo de un toque: añade con fecha en vez de dejarla en blanco. */
  quickLabel: string
  quickDate: IsoDate
  onSubmit: (draft: TaskDraft) => void
}

/**
 * Por defecto la tarea nace sin fecha. Si el texto trae día u hora ("mañana a las 5"),
 * se aplican y se enseña una píldora; tocarla deja el texto literal.
 */
export function Composer({ quickLabel, quickDate, onSubmit }: ComposerProps) {
  const [value, setValue] = useState('')
  const [literal, setLiteral] = useState(false)
  const ready = value.trim().length > 0
  const parsed = useMemo(() => parseTask(value, Date.now()), [value])
  const detected = ready && parsed.label !== null

  const reset = () => {
    setValue('')
    setLiteral(false)
  }

  const submit = (event?: FormEvent) => {
    event?.preventDefault()
    if (!ready) return
    onSubmit(
      detected && !literal
        ? { title: parsed.title, date: parsed.date, time: parsed.time, reminders: parsed.reminders }
        : { title: value, date: null, time: null, reminders: [] },
    )
    reset()
  }

  const submitQuick = () => {
    if (!ready) return
    onSubmit({ title: value, date: quickDate, time: null, reminders: [] })
    reset()
  }

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== 'Enter') return
    event.preventDefault()
    submit()
  }

  return (
    <form className="composer" onSubmit={submit}>
      <button type="submit" className={`composer__mark ${ready ? 'is-ready' : ''}`} aria-label="Añadir">
        <IconPlus size={15} />
      </button>
      <input
        className="composer__input"
        value={value}
        placeholder="Añadir tarea"
        aria-label="Añadir tarea"
        enterKeyHint="done"
        autoComplete="off"
        onChange={(event) => {
          setValue(event.target.value)
          if (!event.target.value.trim()) setLiteral(false)
        }}
        onKeyDown={onKeyDown}
      />
      {detected ? (
        <button
          type="button"
          className={`composer__parsed ${literal ? 'is-off' : ''}`}
          aria-pressed={!literal}
          aria-label={literal ? `Usar ${parsed.label}` : `Ignorar ${parsed.label}`}
          onClick={() => setLiteral((current) => !current)}
        >
          {parsed.reminders.length > 0 && <IconBell size={12} strokeWidth={2} />}
          {parsed.label}
        </button>
      ) : (
        ready && (
          <button type="button" className="composer__quick" onClick={submitQuick} aria-label={`Añadir a ${quickLabel}`}>
            {quickLabel}
          </button>
        )
      )}
    </form>
  )
}
