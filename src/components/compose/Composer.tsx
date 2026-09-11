import { useState } from 'react'
import type { FormEvent, KeyboardEvent } from 'react'
import { IconPlus } from '../ui/Icons'
import './composer.css'

interface ComposerProps {
  placeholder: string
  onSubmit: (title: string) => void
}

export function Composer({ placeholder, onSubmit }: ComposerProps) {
  const [value, setValue] = useState('')

  const submit = (event?: FormEvent) => {
    event?.preventDefault()
    if (!value.trim()) return
    onSubmit(value)
    setValue('')
  }

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== 'Enter') return
    event.preventDefault()
    submit()
  }

  return (
    <form className="composer" onSubmit={submit}>
      <button type="submit" className={`composer__mark ${value ? 'is-ready' : ''}`} aria-label="Añadir tarea">
        <IconPlus size={15} />
      </button>
      <input
        className="composer__input"
        value={value}
        placeholder={placeholder}
        aria-label={placeholder}
        enterKeyHint="done"
        autoComplete="off"
        autoCorrect="on"
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={onKeyDown}
      />
    </form>
  )
}
