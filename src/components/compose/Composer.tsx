import { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react'
import type { FocusEvent, FormEvent, KeyboardEvent, MouseEvent } from 'react'
import type { ComposeTarget } from '../../lib/compose'
import { parseTask } from '../../lib/parse'
import { haptic } from '../../lib/platform/feedback'
import type { RoutineDraft } from '../../lib/repeat'
import { parseRoutine } from '../../lib/repeat'
import type { IsoDate, Place, TaskDraft } from '../../types'
import { IconArrowUp, IconBell, IconCheck, IconClose, IconMic, IconPin, IconPlus, IconRepeat } from '../ui/Icons'
import { VoiceBar } from './VoiceBar'
import { useVoice } from './useVoice'
import './composer.css'

// Se enseña una sola vez por dispositivo: no merece estar en el paquete principal.
const DictationConsent = lazy(() =>
  import('./DictationConsent').then((module) => ({ default: module.DictationConsent })),
)

interface ComposerProps {
  /** Adónde puede ir lo que no dice cuándo. El primero es donde se está mirando, y va elegido. */
  targets: readonly ComposeTarget[]
  /** Texto de la barra vacía: dónde caerá lo que se escriba. */
  placeholder: string
  onSubmit: (draft: TaskDraft) => void
  /** "Tomar creatina todos los días a las 10": no es una tarea, es una rutina. */
  onRoutine: (draft: RoutineDraft) => void
  /** Texto dictado: quien lo recibe crea la tarea y avisa con opción de deshacer. */
  onVoice: (text: string, interpreted: unknown) => void
  /** Se está escribiendo (la barra tiene el foco): la app aparta las pestañas y atenúa la lista. */
  onComposing: (composing: boolean) => void
  /** Lugares guardados; `null` si la plataforma no tiene avisos por lugar. */
  places: readonly Place[] | null
  /** Cambia para pedir el foco (acceso rápido "Nueva tarea" del icono). */
  focusRequest?: number
}

/** Tocar una píldora no debe quitarle el foco a la barra (en el escritorio, el teclado seguiría abierto igual). */
const keepFocus = (event: MouseEvent) => event.preventDefault()

/**
 * La barra de escribir. En reposo es una píldora posada sobre la lista; al tocarla pasa a ser una
 * tarjeta: las pestañas se apartan y en su sitio quedan los destinos ("Hoy", "Mañana", "Sin fecha"),
 * como los filtros de una búsqueda. Si el texto trae día u hora ("mañana a las 5") se aplican y una
 * píldora lo dice; tocarla deja el texto literal. Si dice que se repite ("cada día", "los lunes"),
 * anuncia una rutina. Tras añadir, la barra sigue abierta para la siguiente. Vacía, el micrófono dicta.
 */
export function Composer({ targets, placeholder, onSubmit, onRoutine, onVoice, onComposing, places, focusRequest = 0 }: ComposerProps) {
  const [value, setValue] = useState('')
  const input = useRef<HTMLInputElement>(null)
  const [literal, setLiteral] = useState(false)
  const [active, setActive] = useState(false)
  // El destino elegido a mano; `undefined` = donde se está mirando (el primero).
  const [chosen, setChosen] = useState<IsoDate | null | undefined>(undefined)
  const voice = useVoice(onVoice)
  const ready = value.trim().length > 0
  const routine = useMemo(() => (ready ? parseRoutine(value, Date.now()) : null), [value, ready])
  const parsed = useMemo(() => parseTask(value, Date.now(), places), [value, places])
  const label = routine?.label ?? parsed.label
  const detected = ready && label !== null
  const placed = !routine && (Boolean(parsed.newPlace) || parsed.reminders.some((reminder) => reminder.kind === 'place'))
  const fallback = targets[0]?.date ?? null
  const target = chosen === undefined || !targets.some((item) => item.date === chosen) ? fallback : chosen

  useEffect(() => {
    if (focusRequest) input.current?.focus()
  }, [focusRequest])

  const dictating = voice.phase !== 'idle'

  // Al empezar el dictado la barra deja de ser un campo: sin este aviso no llegaría el `blur`.
  useEffect(() => {
    if (dictating) setActive(false)
  }, [dictating])

  useEffect(() => {
    onComposing(active)
  }, [active, onComposing])

  // Tampoco llega al desmontarse con el foco dentro (se cambia de pestaña).
  useEffect(() => () => onComposing(false), [onComposing])

  // Al cambiar de sitio (otra pestaña, otro día), lo elegido a mano deja de valer.
  useEffect(() => {
    setChosen(undefined)
  }, [fallback])

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
        : literalDraft(target),
    )
    reset()
  }

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') return event.currentTarget.blur()
    if (event.key !== 'Enter') return
    event.preventDefault()
    // Intro sin nada escrito es "ya está": suelta el teclado (en el iPhone no hay otra tecla para ello).
    if (!ready) return event.currentTarget.blur()
    submit()
  }

  const onBlur = (event: FocusEvent<HTMLFormElement>) => {
    if (event.currentTarget.contains(event.relatedTarget)) return
    setActive(false)
    setChosen(undefined)
  }

  const choose = (date: IsoDate | null) => {
    haptic('selection')
    setChosen(date)
    input.current?.focus()
  }

  if (dictating) {
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

  // Lo entendido manda sobre el destino: mientras se aplica, los destinos no pintan nada.
  const applied = detected && !literal
  const tray = active || ready

  return (
    <>
      <form className={`composer ${active ? 'is-active' : ''} ${tray ? 'has-tray' : ''}`} onSubmit={submit} onFocus={() => setActive(true)} onBlur={onBlur}>
        <div className="composer__line">
          <span className="composer__mark" aria-hidden="true">
            <IconPlus size={15} />
          </span>
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
          {ready ? (
            <button type="submit" className="composer__send" aria-label="Añadir" onMouseDown={keepFocus}>
              <IconArrowUp size={17} strokeWidth={2.2} />
            </button>
          ) : (
            <button type="button" className="composer__mic" aria-label="Dictar tarea" onClick={voice.start}>
              <IconMic size={19} />
            </button>
          )}
        </div>
        {tray && (
          <div className="composer__tray" role="group" aria-label="Dónde va">
            {detected && (
              <button
                type="button"
                className={`composer__parsed ${literal ? 'is-off' : ''} ${routine ? 'is-routine' : ''}`}
                aria-pressed={!literal}
                aria-label={literal ? `Usar ${label}` : `Ignorar ${label}`}
                onMouseDown={keepFocus}
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
            {!applied &&
              targets.map((item) => (
                <button
                  key={item.date ?? 'none'}
                  type="button"
                  className={`composer__target ${item.date === target ? 'is-active' : ''}`}
                  aria-pressed={item.date === target}
                  onMouseDown={keepFocus}
                  onClick={() => choose(item.date)}
                >
                  {item.label}
                </button>
              ))}
          </div>
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
