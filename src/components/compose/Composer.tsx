import { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react'
import type { FocusEvent, FormEvent, KeyboardEvent, MouseEvent, MutableRefObject } from 'react'
import type { ComposeTarget } from '../../lib/compose'
import { addLabel } from '../../lib/compose'
import type { Details, SummaryIcon } from '../../lib/details'
import { applyParsed, detailsFrom, detailsSummary, toRoutineDraft, toTaskDraft } from '../../lib/details'
import { createId } from '../../lib/id'
import type { ParsedTask } from '../../lib/parse'
import { parseTask } from '../../lib/parse'
import { haptic } from '../../lib/platform/feedback'
import type { RoutineDraft } from '../../lib/repeat'
import { parseRoutine } from '../../lib/repeat'
import { capitalize } from '../../lib/title'
import { useCopy, useLanguage } from '../../state/LanguageProvider'
import { useAppState } from '../../state/StoreProvider'
import type { IsoDate, Place, TaskDraft } from '../../types'
import { IconArrowUp, IconBell, IconCheck, IconClose, IconLeave, IconMic, IconPin, IconPlace, IconPlus, IconRepeat, IconSliders, IconTextSize } from '../ui/Icons'
import { useToast } from '../ui/Toast'
import { VoiceBar } from './VoiceBar'
import { usePullUp } from './usePullUp'
import { useVoice } from './useVoice'
import './composer.css'

// Se enseña una sola vez por dispositivo: no merece estar en el paquete principal.
const DictationConsent = lazy(() =>
  import('./DictationConsent').then((module) => ({ default: module.DictationConsent })),
)
// La ficha se pide en cuanto se toca la barra: al desplegarla ya está.
const loadComposeSheet = () => import('./ComposeSheet')
const ComposeSheet = lazy(() => loadComposeSheet().then((module) => ({ default: module.ComposeSheet })))

interface ComposerProps {
  /** Adónde puede ir lo que no dice cuándo. El primero es donde se está mirando, y va elegido. */
  targets: readonly ComposeTarget[]
  today: IsoDate
  onSubmit: (draft: TaskDraft) => void
  /** "Tomar creatina todos los días a las 10": no es una tarea, es una rutina. `false` si no cabe. */
  onRoutine: (draft: RoutineDraft) => boolean
  /** Texto dictado: quien lo recibe crea la tarea (en el destino elegido) y avisa con opción de deshacer. */
  onVoice: (text: string, interpreted: unknown, target: ComposeTarget | undefined) => void
  /** Se está escribiendo (la barra tiene el foco): la app aparta las pestañas y atenúa la lista. */
  onComposing: (composing: boolean) => void
  /** La barra se ha vaciado (tras añadir, o al soltarla sin nada): lo elegido para ella ya no vale. */
  onReset?: () => void
  /** En la PWA no hay avisos por lugar: la píldora que lo dice lleva a la pestaña Lugares. */
  onPlacesHint?: () => void
  /** Lugares guardados; `null` si la plataforma no tiene avisos por lugar. */
  places: readonly Place[] | null
  /** Cambia para pedir el foco (acceso rápido "Nueva tarea" del icono). */
  focusRequest?: number
  /**
   * Para dar el foco dentro del mismo toque (el + de una sección): iOS solo saca el teclado si el foco
   * llega durante el gesto, no en un render posterior.
   */
  focusRef?: MutableRefObject<(() => void) | null>
}

const COPY = {
  es: {
    cancel: 'Cancelar dictado',
    finish: 'Terminar y crear tarea',
    add: 'Añadir',
    dictate: 'Dictar tarea',
    decided: 'Lo decidido',
    where: 'Dónde va',
    clear: 'Quitar los detalles',
    change: (label: string) => `${label}: cambiar`,
    importance: (label: string) => `Importancia ${label}: cambiar`,
    use: (label: string) => `Usar ${label}`,
    ignore: (label: string) => `Ignorar ${label}`,
    literalHint: 'Se guardará tal cual lo escribes.',
    apply: (label: string) => `Aplicar ${label}`,
    placesHint: 'Lugares: en la app del iPhone',
    details: 'Detalles',
  },
  en: {
    cancel: 'Cancel dictation',
    finish: 'Finish and create the task',
    add: 'Add',
    dictate: 'Dictate a task',
    decided: 'Your choices',
    where: 'Where it goes',
    clear: 'Remove the details',
    change: (label: string) => `${label}: change`,
    importance: (label: string) => `Importance ${label}: change`,
    use: (label: string) => `Use ${label}`,
    ignore: (label: string) => `Ignore ${label}`,
    literalHint: 'It’ll be saved as written.',
    apply: (label: string) => `Apply ${label}`,
    placesHint: 'Places: in the iPhone app',
    details: 'Details',
  },
} as const

/** Lo mismo que recorta el reducir: así iOS lo respeta al pegar. */
const MAX_TITLE = 500

/** La barra vacía no tiene nada que entender: no hace falta pasarle el analizador. */
const NOTHING: ParsedTask = { title: '', date: null, time: null, duration: null, reminders: [], label: null }

/** Tocar una píldora no debe quitarle el foco a la barra (en el escritorio, el teclado seguiría abierto igual). */
const keepFocus = (event: MouseEvent) => event.preventDefault()

/** Sustituir el texto de golpe (seleccionar todo y teclear) es empezar otra tarea, no corregir la que había. */
const REPLACED_MAX = 2
const REPLACED_MIN_BEFORE = 5
/** Se enseña una sola vez qué hace la píldora tachada. */
const LITERAL_HINT_KEY = 'tasks:literal-hinted'
/** Frases de lugar que en la PWA se quedan tal cual: se avisa de que eso es cosa del iPhone. */
const PLACE_PHRASE =
  /\b(al (llegar|pasar por|salir|irme|marcharme)|cuando (llegue|salga|vuelva|me vaya|est[eé])|nada más (llegar|salir)|en cuanto (llegue|salga|me vaya)|when i (get to|arrive|leave|head out of)|once i.m at)\b/i

const SUMMARY_ICONS: Record<Exclude<SummaryIcon, null>, typeof IconBell> = {
  bell: IconBell,
  pin: IconPin,
  leave: IconLeave,
  repeat: IconRepeat,
  size: IconTextSize,
}

/**
 * La barra de escribir. En reposo es una píldora posada sobre la lista; al tocarla pasa a ser una
 * tarjeta: las pestañas se apartan y en su sitio quedan los destinos ("Hoy", "Mañana", "Sin fecha"),
 * como los filtros de una búsqueda. Si el texto trae día u hora ("mañana a las 5") se aplican y una
 * píldora lo dice; tocarla deja el texto literal. Si dice que se repite ("cada día", "los lunes"),
 * anuncia una rutina. Tras añadir, la barra sigue abierta para la siguiente. Vacía, el micrófono dicta.
 *
 * Para decidirlo todo antes de añadir, **Detalles** (o tirar del asa hacia arriba) la despliega en una
 * ficha, como el mini reproductor de Spotify se abre en el reproductor entero. Lo decidido allí se
 * queda en la barra en unas píldoras (el día y la hora, los avisos…) hasta que se añade; la × lo quita.
 */
export function Composer({ targets, today, onSubmit, onRoutine, onVoice, onComposing, onReset, onPlacesHint, places, focusRequest = 0, focusRef }: ComposerProps) {
  const state = useAppState()
  const copy = useCopy(COPY)
  const language = useLanguage()
  const toast = useToast()
  const [value, setValue] = useState('')
  const input = useRef<HTMLInputElement>(null)
  const [literal, setLiteral] = useState(false)
  const [active, setActive] = useState(false)
  // El destino elegido a mano (su `key`); `undefined` = donde se está mirando (el primero).
  const [chosen, setChosen] = useState<string | undefined>(undefined)
  // Lo decidido en la ficha; `null` mientras no se ha desplegado (manda lo que dice la frase).
  const [details, setDetails] = useState<Details | null>(null)
  const [expanded, setExpanded] = useState(false)
  // La frase tal como se escribió y el título que quedó al pasar lo entendido a la ficha: si no se ha
  // tocado el título, quitar la ficha (×) devuelve la frase entera.
  const [absorbed, setAbsorbed] = useState<{ phrase: string; title: string } | null>(null)
  // La ficha se monta la primera vez que se despliega y después se queda (para animar al plegarse).
  const [sheetUsed, setSheetUsed] = useState(false)
  const fallback = targets[0]?.key
  const targetItem = targets.find((item) => item.key === chosen) ?? targets[0]
  const target = targetItem?.date ?? null
  // El + de una sección: lo que se añada va a ella (si tiene día; sin fecha no hay secciones).
  const targetSection = targetItem?.sectionId ?? null
  // Lo dictado cae donde diga la barra, igual que lo tecleado.
  const voice = useVoice((text, interpreted) => onVoice(text, interpreted, targetItem))
  const ready = value.trim().length > 0
  // El idioma también cuenta: al cambiarlo con texto en la barra, se vuelve a entender.
  const routine = useMemo(() => (ready && !details ? parseRoutine(value, Date.now()) : null), [value, ready, details, language]) // eslint-disable-line react-hooks/exhaustive-deps
  const parsed = useMemo(() => (ready ? parseTask(value, Date.now(), places) : NOTHING), [value, ready, places, language]) // eslint-disable-line react-hooks/exhaustive-deps
  const label = routine?.label ?? parsed.label
  const detected = ready && !details && label !== null
  // Cómo avisa el lugar dicho: al llegar (la chincheta) o al salir.
  const placed = routine ? null : (parsed.newPlace?.on ?? parsed.reminders.flatMap((reminder) => (reminder.kind === 'place' ? [reminder.on] : []))[0] ?? null)
  // Con la ficha abierta manda ella; si lo tecleado después dice algo nuevo ("a las 5"), se ofrece aplicarlo.
  const suggestion = details && !details.repeat && !expanded && parsed.label !== null && parsed.title.trim() !== value.trim() ? parsed : null
  // En la PWA una frase de lugar se queda tal cual: se dice por qué.
  const placesHint = places === null && !details && ready && PLACE_PHRASE.test(value)
  // El texto de la barra vacía dice adónde cae lo que se escriba (también al cambiar de destino).
  const placeholder = targetItem ? addLabel(targetItem.date, today, targetItem.sectionName) : ''

  useEffect(() => {
    if (!focusRequest) return
    setExpanded(false)
    input.current?.focus()
  }, [focusRequest])

  useEffect(() => {
    if (!focusRef) return
    focusRef.current = () => {
      setExpanded(false)
      input.current?.focus()
    }
    return () => {
      focusRef.current = null
    }
  }, [focusRef])

  const dictating = voice.phase !== 'idle'

  // Al empezar el dictado la barra deja de ser un campo: sin este aviso no llegaría el `blur`.
  useEffect(() => {
    if (dictating) setActive(false)
  }, [dictating])

  useEffect(() => {
    onComposing(active)
    if (active) void loadComposeSheet()
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
    setDetails(null)
    setAbsorbed(null)
    setChosen(undefined)
    onReset?.()
  }

  /** La sección elegida (el + de una sección), si lo añadido tiene día. */
  const inSection = (date: IsoDate | null) => (date && targetSection ? { sectionId: targetSection } : {})

  const literalDraft = (date: IsoDate | null): TaskDraft => ({ title: value, date, time: null, duration: null, reminders: [], ...inSection(date) })

  /** Con la ficha: lo que dice ella, tarea o rutina. */
  const submitDetails = (current: Details) => {
    if (!ready) return
    const routineDraft = toRoutineDraft(current, value)
    // Una rutina que no cabe (ya hay 50) se queda en la ficha: lo rellenado no se pierde.
    if (routineDraft && !onRoutine(routineDraft)) return
    if (!routineDraft) onSubmit(toTaskDraft(current, value))
    reset()
    setExpanded(false)
  }

  const submit = (event?: FormEvent) => {
    event?.preventDefault()
    if (!ready) return
    if (details) return submitDetails(details)
    const fresh = parseRoutine(value, Date.now())
    if (fresh && !literal) {
      if (onRoutine(fresh)) reset()
      return
    }
    // Se vuelve a analizar con la hora de ahora: "en 30 min" o "a las 9" cuentan desde que se
    // añade la tarea, no desde la última tecla. Lo que no dice día va al destino de la barra.
    const parsedNow = parseTask(value, Date.now(), places)
    const { title, time, duration, reminders, newPlace } = parsedNow
    const date = parsedNow.date ?? target
    onSubmit(
      parsedNow.label !== null && !literal
        ? { title, date, time, duration, reminders, ...(newPlace ? { newPlace } : {}), ...inSection(date) }
        : literalDraft(target),
    )
    reset()
  }

  /** Lo entendido después de abrir la ficha pasa a sus campos; del texto queda el título. */
  const applySuggestion = () => {
    if (!details || !suggestion) return
    haptic('selection')
    const parsedNow = parseTask(value, Date.now(), places)
    setDetails(applyParsed(details, parsedNow, createId))
    setValue(capitalize(parsedNow.title))
  }

  /** La píldora tachada: lo escrito se guarda tal cual. La primera vez se dice. */
  const toggleLiteral = () => {
    setLiteral((current) => !current)
    if (literal) return
    try {
      if (localStorage.getItem(LITERAL_HINT_KEY)) return
      localStorage.setItem(LITERAL_HINT_KEY, '1')
    } catch {
      return
    }
    toast({ message: copy.literalHint })
  }

  /**
   * Despliega la ficha. La primera vez, lo que la frase ya decía pasa a sus campos y del texto queda
   * solo el título: lo que se ve en la ficha es lo que se va a crear.
   */
  const expand = () => {
    haptic('selection')
    if (!details) {
      const applied = detected && !literal
      const now = Date.now()
      const repeat = applied ? parseRoutine(value, now) : null
      const parsedNow = applied && !repeat ? parseTask(value, now, places) : null
      const fresh = detailsFrom(parsedNow, repeat, target, createId)
      setDetails(fresh.date && targetSection ? { ...fresh, sectionId: targetSection } : fresh)
      const title = repeat?.title ?? parsedNow?.title
      if (title !== undefined) {
        const clean = capitalize(title)
        setAbsorbed({ phrase: value, title: clean })
        setValue(clean)
      }
    }
    setSheetUsed(true)
    setExpanded(true)
    input.current?.blur()
  }

  const pull = usePullUp<HTMLFormElement>(expand)

  const clearDetails = () => {
    haptic('selection')
    setDetails(null)
    if (absorbed && value === absorbed.title) setValue(absorbed.phrase)
    setAbsorbed(null)
  }

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') return event.currentTarget.blur()
    if (event.key !== 'Enter') return
    event.preventDefault()
    // Intro sin nada escrito es "ya está": suelta el teclado (en el iPhone no hay otra tecla para ello).
    if (!ready) return event.currentTarget.blur()
    submit()
  }

  // Soltar el teclado no cambia lo elegido mientras haya algo escrito: las píldoras siguen a la vista.
  // Sin nada escrito, la barra vuelve a su destino de siempre.
  const onBlur = (event: FocusEvent<HTMLFormElement>) => {
    if (event.currentTarget.contains(event.relatedTarget)) return
    setActive(false)
    if (!ready && !details) {
      setChosen(undefined)
      onReset?.()
    }
  }

  const choose = (key: string) => {
    haptic('selection')
    setChosen(key)
    input.current?.focus()
  }

  if (dictating) {
    return (
      <div className="composer composer--voice" role="status" aria-live="polite">
        <button type="button" className="composer__voice-btn" aria-label={copy.cancel} onClick={voice.cancel}>
          <IconClose size={16} />
        </button>
        <VoiceBar phase={voice.phase} level={voice.level} partial={voice.partial} remaining={voice.remaining} />
        {voice.phase === 'listening' && (
          <button
            type="button"
            className="composer__voice-btn composer__voice-btn--done"
            aria-label={copy.finish}
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
  const showTargets = !details && !applied
  const tray = active || ready || details !== null
  const summary = details ? detailsSummary(details, today, state.sections, state.places) : []

  return (
    <>
      <form
        ref={pull.card}
        className={`composer ${active ? 'is-active' : ''} ${tray ? 'has-tray' : ''} ${expanded ? 'is-expanded' : ''}`}
        onSubmit={submit}
        onFocus={() => setActive(true)}
        onBlur={onBlur}
      >
        {tray && (
          <div className="composer__grab" aria-hidden="true" onMouseDown={keepFocus} {...pull.handlers}>
            <span />
          </div>
        )}
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
            enterKeyHint={ready ? 'send' : 'done'}
            autoComplete="off"
            maxLength={MAX_TITLE}
            onChange={(event) => {
              const next = event.target.value
              // Borrarlo todo, o sustituirlo de golpe, es empezar otra: fuera también lo decidido en la ficha.
              if (!next.trim()) return reset()
              if (details && next.length <= REPLACED_MAX && value.length > REPLACED_MIN_BEFORE) reset()
              setValue(next)
            }}
            onKeyDown={onKeyDown}
          />
          {ready ? (
            <button type="submit" className="composer__send" aria-label={copy.add} onMouseDown={keepFocus}>
              <IconArrowUp size={17} strokeWidth={2.2} />
            </button>
          ) : (
            !details &&
            voice.available && (
              <button type="button" className="composer__mic" aria-label={copy.dictate} onClick={voice.start}>
                <IconMic size={19} />
              </button>
            )
          )}
        </div>
        {tray && (
          <div className="composer__foot">
            <div className="composer__tray" role="group" aria-label={details ? copy.decided : copy.where}>
              {details && (
                <button type="button" className="composer__clear" aria-label={copy.clear} onMouseDown={keepFocus} onClick={clearDetails}>
                  <IconClose size={14} />
                </button>
              )}
              {summary.map((item) => {
                const Icon = item.icon ? SUMMARY_ICONS[item.icon] : null
                return (
                  <button
                    key={item.key}
                    type="button"
                    className={`composer__target is-detail ${item.key === 'when' || item.key === 'repeat' ? 'is-active' : ''}`}
                    aria-label={item.key === 'importance' ? copy.importance(item.label) : copy.change(item.label)}
                    onMouseDown={keepFocus}
                    onClick={expand}
                  >
                    {Icon && <Icon size={12} strokeWidth={2} />}
                    {item.label}
                  </button>
                )
              })}
              {suggestion && (
                <button type="button" className="composer__parsed composer__parsed--suggest" onMouseDown={keepFocus} onClick={applySuggestion}>
                  <IconSliders size={12} strokeWidth={2} />
                  {copy.apply(suggestion.label ?? '')}
                </button>
              )}
              {detected && (
                <button
                  type="button"
                  className={`composer__parsed ${literal ? 'is-off' : ''} ${routine ? 'is-routine' : ''}`}
                  aria-pressed={!literal}
                  aria-label={literal ? copy.use(label) : copy.ignore(label)}
                  onMouseDown={keepFocus}
                  onClick={toggleLiteral}
                >
                  {routine ? (
                    <IconRepeat size={12} strokeWidth={2} />
                  ) : placed ? (
                    <IconPlace on={placed} size={12} strokeWidth={2} />
                  ) : (
                    parsed.reminders.length > 0 && <IconBell size={12} strokeWidth={2} />
                  )}
                  {label}
                </button>
              )}
              {placesHint && (
                <button type="button" className="composer__parsed is-off" onMouseDown={keepFocus} onClick={onPlacesHint}>
                  <IconPin size={12} strokeWidth={2} />
                  {copy.placesHint}
                </button>
              )}
              {showTargets &&
                targets.map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    className={`composer__target ${item.sectionId ? 'is-section' : ''} ${item.key === targetItem?.key ? 'is-active' : ''}`}
                    aria-pressed={item.key === targetItem?.key}
                    onMouseDown={keepFocus}
                    onClick={() => choose(item.key)}
                  >
                    {item.label}
                  </button>
                ))}
            </div>
            {/* Con algo decidido, solo el icono: el resumen necesita el sitio y cualquier píldora abre la ficha. */}
            <button
              type="button"
              className={`composer__more ${details ? 'has-details' : ''}`}
              aria-label={copy.details}
              aria-haspopup="dialog"
              aria-expanded={expanded}
              onMouseDown={keepFocus}
              onClick={expand}
            >
              <IconSliders size={15} />
              {!details && <span aria-hidden="true">{copy.details}</span>}
            </button>
          </div>
        )}
      </form>
      {sheetUsed && (
        <Suspense fallback={null}>
          <ComposeSheet
            open={expanded && details !== null}
            title={value}
            details={details}
            today={today}
            onTitle={setValue}
            onChange={setDetails}
            onSubmit={() => details && submitDetails(details)}
            onClose={() => setExpanded(false)}
          />
        </Suspense>
      )}
      {voice.asking && (
        <Suspense fallback={null}>
          <DictationConsent open onContinue={voice.proceed} onClose={voice.dismiss} />
        </Suspense>
      )}
    </>
  )
}
