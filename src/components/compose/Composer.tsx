import { useState } from 'react'
import type { FormEvent, KeyboardEvent } from 'react'
import type { IsoDate } from '../../types'
import { IconPlus } from '../ui/Icons'
import './composer.css'

interface ComposerProps {
  /** Atajo de un toque: añade con fecha en vez de dejarla en blanco. */
  quickLabel: string
  quickDate: IsoDate
  onSubmit: (title: string, date: IsoDate | null) => void
}

/** Por defecto la tarea nace sin fecha; el atajo la manda al día que toque. */
export function Composer({ quickLabel, quickDate, onSubmit }: ComposerProps) {
  const [value, setValue] = useState('')
  const ready = value.trim().length > 0

  const submit = (date: IsoDate | null, event?: FormEvent) => {
    event?.preventDefault()
    if (!ready) return
    onSubmit(value, date)
    setValue('')
  }

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== 'Enter') return
    event.preventDefault()
    submit(null)
  }

  return (
    <form className="composer" onSubmit={(event) => submit(null, event)}>
      <button type="submit" className={`composer__mark ${ready ? 'is-ready' : ''}`} aria-label="Añadir sin fecha">
        <IconPlus size={15} />
      </button>
      <input
        className="composer__input"
        value={value}
        placeholder="Añadir tarea"
        aria-label="Añadir tarea"
        enterKeyHint="done"
        autoComplete="off"
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={onKeyDown}
      />
      {ready && (
        <button
          type="button"
          className="composer__quick"
          onClick={() => submit(quickDate)}
          aria-label={`Añadir a ${quickLabel}`}
        >
          {quickLabel}
        </button>
      )}
    </form>
  )
}
