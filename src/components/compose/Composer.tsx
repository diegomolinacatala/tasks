import { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react'
import type { FormEvent, KeyboardEvent } from 'react'
import { parseTask } from '../../lib/parse'
import type { IsoDate, Place, TaskDraft } from '../../types'
import { IconBell, IconCheck, IconClose, IconMic, IconPin, IconPlus } from '../ui/Icons'
import { VoiceBar } from './VoiceBar'
import { useVoice } from './useVoice'
import './composer.css'

// Se enseña una sola vez por dispositivo: no merece estar en el paquete principal.
const DictationConsent = lazy(() =>
  import('./DictationConsent').then((module) => ({ default: module.DictationConsent })),
)

interface ComposerProps {
  /** Atajo de un toque: añade con fecha en vez de dejarla en blanco. */
  quickLabel: string
  quickDate: IsoDate
  onSubmit: (draft: TaskDraft) => void
  /** Texto dictado: quien lo recibe crea la tarea y avisa con opción de deshacer. */
  onVoice: (text: string, interpreted: unknown) => void
  /** Lugares guardados; `null` si la plataforma no tiene avisos por lugar. */
  places: readonly Place[] | null
  /** Cambia para pedir el foco (acceso rápido "Nueva tarea" del icono). */
  focusRequest?: number
}

/**
 * Por defecto la tarea nace sin fecha. Si el texto trae día u hora ("mañana a las 5"),
 * se aplican y se enseña una píldora; tocarla deja el texto literal. Con la barra vacía,
 * el micrófono dicta la tarea entera.
 */
export function Composer({ quickLabel, quickDate, onSubmit, onVoice, places, focusRequest = 0 }: ComposerProps) {
  const [value, setValue] = useState('')
  const input = useRef<HTMLInputElement>(null)
  const [literal, setLiteral] = useState(false)
  const voice = useVoice(onVoice)
  const ready = value.trim().length > 0
  const parsed = useMemo(() => parseTask(value, Date.now(), places), [value, places])
  const detected = ready && parsed.label !== null
  const placed = Boolean(parsed.newPlace) || parsed.reminders.some((reminder) => reminder.kind === 'place')

  useEffect(() => {
    if (focusRequest) input.current?.focus()
  }, [focusRequest])

  const reset = () => {
    setValue('')
    setLiteral(false)
  }

  const submit = (event?: FormEvent) => {
    event?.preventDefault()
    if (!ready) return
    // Se vuelve a analizar con la hora de ahora: "en 30 min" o "a las 9" cuentan desde que se
    // añade la tarea, no desde la última tecla.
    const fresh = parseTask(value, Date.now(), places)
    const { title, date, time, duration, reminders, newPlace } = fresh
    onSubmit(
      fresh.label !== null && !literal
        ? { title, date, time, duration, reminders, ...(newPlace ? { newPlace } : {}) }
        : { title: value, date: null, time: null, duration: null, reminders: [] },
    )
    reset()
  }

  const submitQuick = () => {
    if (!ready) return
    onSubmit({ title: value, date: quickDate, time: null, duration: null, reminders: [] })
    reset()
  }

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== 'Enter') return
    event.preventDefault()
    submit()
  }

  if (voice.phase !== 'idle') {
    return (
      <div className="composer composer--voice" role="status" aria-live="polite">
        <button type="button" className="composer__voice-btn" aria-label="Cancelar dictado" onClick={voice.cancel}>
          <IconClose size={16} />
        </button>
        <VoiceBar phase={voice.phase} level={voice.level} partial={voice.partial} />
        {voice.phase === 'listening' && (
          <button
            type="button"
            className="composer__voice-btn composer__voice-btn--done"
            aria-label="Terminar y crear tarea"
            onClick={voice.stop}
          >
            <IconCheck size={16} strokeWidth={2.5} />
          </button>
        )}
      </div>
    )
  }

  return (
    <>
      <form className="composer" onSubmit={submit}>
        <button type="submit" className={`composer__mark ${ready ? 'is-ready' : ''}`} aria-label="Añadir">
          <IconPlus size={15} />
        </button>
        <input
          ref={input}
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
        {!ready && (
          <button type="button" className="composer__mic" aria-label="Dictar tarea" onClick={voice.start}>
            <IconMic size={19} />
          </button>
        )}
        {detected && (
          <button
            type="button"
            className={`composer__parsed ${literal ? 'is-off' : ''}`}
            aria-pressed={!literal}
            aria-label={literal ? `Usar ${parsed.label}` : `Ignorar ${parsed.label}`}
            onClick={() => setLiteral((current) => !current)}
          >
            {placed ? <IconPin size={12} strokeWidth={2} /> : parsed.reminders.length > 0 && <IconBell size={12} strokeWidth={2} />}
            {parsed.label}
          </button>
        )}
        {ready && !detected && (
          <button type="button" className="composer__quick" onClick={submitQuick} aria-label={`Añadir a ${quickLabel}`}>
            {quickLabel}
          </button>
        )}
      </form>
      {voice.asking && (
        <Suspense fallback={null}>
          <DictationConsent open onContinue={voice.proceed} />
        </Suspense>
      )}
    </>
  )
}
