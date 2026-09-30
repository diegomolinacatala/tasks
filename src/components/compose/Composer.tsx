import { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react'
import type { FormEvent, KeyboardEvent } from 'react'
import { parseTask } from '../../lib/parse'
import type { RoutineDraft } from '../../lib/repeat'
import { parseRoutine } from '../../lib/repeat'
import type { IsoDate, Place, TaskDraft } from '../../types'
import { IconBell, IconCheck, IconClose, IconMic, IconPin, IconPlus, IconRepeat } from '../ui/Icons'
import { VoiceBar } from './VoiceBar'
import { useVoice } from './useVoice'
import './composer.css'

// Se enseña una sola vez por dispositivo: no merece estar en el paquete principal.
const DictationConsent = lazy(() =>
  import('./DictationConsent').then((module) => ({ default: module.DictationConsent })),
)

export interface QuickTarget {
  label: string
  date: IsoDate | null
}

interface ComposerProps {
  /** Adónde va lo que no dice cuándo: `null` en la Bandeja, el día elegido en la Agenda. */
  defaultDate: IsoDate | null
  /** Texto de la barra vacía: dónde caerá lo que se escriba. */
  placeholder: string
  /** Atajo de un toque al otro sitio ("Hoy" desde la Bandeja, "Sin fecha" desde la Agenda). */
  quick: QuickTarget | null
  onSubmit: (draft: TaskDraft) => void
  /** "Tomar creatina todos los días a las 10": no es una tarea, es una rutina. */
  onRoutine: (draft: RoutineDraft) => void
  /** Texto dictado: quien lo recibe crea la tarea y avisa con opción de deshacer. */
  onVoice: (text: string, interpreted: unknown) => void
  /** Lugares guardados; `null` si la plataforma no tiene avisos por lugar. */
  places: readonly Place[] | null
  /** Cambia para pedir el foco (acceso rápido "Nueva tarea" del icono). */
  focusRequest?: number
}

/**
 * Si el texto trae día u hora ("mañana a las 5"), se aplican y se enseña una píldora; tocarla deja
 * el texto literal. Si dice que se repite ("cada día", "los lunes"), la píldora anuncia una rutina.
 * Sin nada de eso, la tarea va a donde se está mirando. Con la barra vacía, el micrófono dicta.
 */
export function Composer({ defaultDate, placeholder, quick, onSubmit, onRoutine, onVoice, places, focusRequest = 0 }: ComposerProps) {
  const [value, setValue] = useState('')
  const input = useRef<HTMLInputElement>(null)
  const [literal, setLiteral] = useState(false)
  const voice = useVoice(onVoice)
  const ready = value.trim().length > 0
  const routine = useMemo(() => (ready ? parseRoutine(value, Date.now()) : null), [value, ready])
  const parsed = useMemo(() => parseTask(value, Date.now(), places), [value, places])
  const label = routine?.label ?? parsed.label
  const detected = ready && label !== null
  const placed = !routine && (Boolean(parsed.newPlace) || parsed.reminders.some((reminder) => reminder.kind === 'place'))

  useEffect(() => {
    if (focusRequest) input.current?.focus()
  }, [focusRequest])

  const reset = () => {
    setValue('')
    setLiteral(false)
  }

  const literalDraft = (date: IsoDate | null): TaskDraft => ({ title: value, date, time: null, duration: null, reminders: [] })

  const submit = (event?: FormEvent) => {
    event?.preventDefault()
    if (!ready) return
    const fresh = parseRoutine(value, Date.now())
    if (fresh && !literal) {
      onRoutine(fresh)
      reset()
      return
    }
    // Se vuelve a analizar con la hora de ahora: "en 30 min" o "a las 9" cuentan desde que se
    // añade la tarea, no desde la última tecla.
    const parsedNow = parseTask(value, Date.now(), places)
    const { title, date, time, duration, reminders, newPlace } = parsedNow
    onSubmit(
      parsedNow.label !== null && !literal
        ? { title, date, time, duration, reminders, ...(newPlace ? { newPlace } : {}) }
        : literalDraft(defaultDate),
    )
    reset()
  }

  const submitQuick = () => {
    if (!ready || !quick) return
    onSubmit(literalDraft(quick.date))
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
          placeholder={placeholder}
          aria-label={placeholder}
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
            className={`composer__parsed ${literal ? 'is-off' : ''} ${routine ? 'is-routine' : ''}`}
            aria-pressed={!literal}
            aria-label={literal ? `Usar ${label}` : `Ignorar ${label}`}
            onClick={() => setLiteral((current) => !current)}
          >
            {routine ? (
              <IconRepeat size={12} strokeWidth={2} />
            ) : placed ? (
              <IconPin size={12} strokeWidth={2} />
            ) : (
              parsed.reminders.length > 0 && <IconBell size={12} strokeWidth={2} />
            )}
            {label}
          </button>
        )}
        {ready && !detected && quick && (
          <button type="button" className="composer__quick" onClick={submitQuick} aria-label={`Añadir a ${quick.label}`}>
            {quick.label}
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
