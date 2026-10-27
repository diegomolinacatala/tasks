import { useEffect, useRef, useState } from 'react'
import type { CSSProperties, ComponentType } from 'react'
import { createPortal } from 'react-dom'
import { MARK_PATH } from '../../lib/boot'
import { showsCalendar } from '../../lib/platform/calendar'
import { isNative, showsPlaces } from '../../lib/platform'
import { haptic } from '../../lib/platform/feedback'
import type { PlateId, WelcomeRun } from '../../lib/welcome'
import { platesAfter } from '../../lib/welcome'
import { useCopy } from '../../state/LanguageProvider'
import { IconChevronLeft } from '../ui/Icons'
import { BasketScene } from './BasketScene'
import { CalendarScene } from './CalendarScene'
import { DayScene } from './DayScene'
import { DetailsScene } from './DetailsScene'
import { DictateScene } from './DictateScene'
import { MonthScene } from './MonthScene'
import { PlacesScene } from './PlacesScene'
import { RoutineScene } from './RoutineScene'
import { SuggestScene } from './SuggestScene'
import { SwipeScene } from './SwipeScene'
import { WriteScene } from './WriteScene'
import './welcome.css'
import './plates.css'

interface WelcomeProps {
  /** Qué láminas tocan y si la portada presenta la app o anuncia lo nuevo (`lib/welcome.ts`). */
  run: WelcomeRun
  /** Desde Ajustes, no desde el arranque: la portada entra sin esperar (no hay relevo que cuidar). */
  quick?: boolean
  /** Ya está pintada: se puede fundir la pantalla de arranque que tiene encima. */
  onReady?: () => void
  onDone: () => void
}

interface Plate {
  id: PlateId
  Scene: ComponentType
}

/**
 * Cada lámina es un trozo de la app de verdad, para probarlo con el dedo antes de empezar. Una lámina
 * nueva lleva su versión en `PLATE_SINCE` (`lib/welcome.ts`): así sale también a quien actualiza.
 */
const PLATES: readonly Plate[] = [
  { id: 'write', Scene: WriteScene },
  { id: 'details', Scene: DetailsScene },
  // El widget del micrófono solo existe en el iPhone (y en local, para verlo).
  ...(isNative || import.meta.env.DEV ? [{ id: 'dictate' as const, Scene: DictateScene }] : []),
  { id: 'swipe', Scene: SwipeScene },
  { id: 'day', Scene: DayScene },
  { id: 'month', Scene: MonthScene },
  { id: 'routine', Scene: RoutineScene },
  { id: 'basket', Scene: BasketScene },
  // Los avisos por lugar solo existen en el iPhone (y en local).
  ...(showsPlaces ? [{ id: 'places' as const, Scene: PlacesScene }] : []),
  { id: 'suggest', Scene: SuggestScene },
  // El calendario solo existe en el iPhone (y en local, con el de muestra).
  ...(showsCalendar ? [{ id: 'calendar' as const, Scene: CalendarScene }] : []),
]

const device = isNative ? 'iPhone' : null

const COPY = {
  es: {
    plates: {
      write: { kicker: 'Escribir', title: 'Escribe como hablas.', text: 'El día, la hora y los avisos salen solos de la frase.' },
      details: {
        kicker: 'Detalles',
        title: 'Todo, antes de añadir.',
        text: 'Toca Detalles o tira de la barra hacia arriba: día, hora, avisos y si se repite.',
      },
      dictate: {
        kicker: 'Dictar',
        title: 'Habla, sin desbloquear.',
        text: 'El widget del micrófono abre Tasks ya escuchando, desde la pantalla de bloqueo o el botón de acción. Tócalo.',
      },
      swipe: { kicker: 'Gestos', title: 'Un gesto y listo.', text: 'A la derecha, hecha. A la izquierda, fuera. Pruébalo.' },
      day: {
        kicker: 'Horario',
        title: 'Suéltala a su hora.',
        text: 'Mantén pulsada una tarea sin hora y súbela por el horario: cae a la hora que marques, de cuarto en cuarto.',
      },
      month: { kicker: 'Agenda', title: 'De la semana al mes.', text: 'Tira de los días hacia abajo y salta a cualquier fecha.' },
      basket: {
        kicker: 'La cesta',
        title: 'La compra, aparte.',
        text: '«Pan, leche y 2 kg de arroz» son tres filas. Tócalas en la tienda y repite lo de siempre de un toque.',
      },
      routine: {
        kicker: 'Rutinas',
        title: 'Lo de cada día.',
        text: isNative
          ? 'Cada mañana amanecen sin tachar. Se tachan también desde la pantalla de bloqueo.'
          : 'Cada mañana amanecen sin tachar, con su emoji y su racha.',
      },
      places: {
        kicker: 'Lugares',
        title: 'Suena donde toca.',
        text: '«Llamar a Miguel al moverme» suena a 100 m de donde estás; «al salir de casa», al cruzar el círculo. Arrastra tu punto.',
      },
      suggest: {
        kicker: 'Sugerencias',
        title: 'Rodéalo y cuéntalo.',
        text: 'En Ajustes, Sugerir una mejora: rodea con el dedo lo que cambiarías y escríbelo. Pruébalo aquí.',
      },
      calendar: {
        kicker: 'Calendario',
        title: 'Tu calendario, en tu día.',
        text: 'Tus eventos de iCloud, Google u Outlook, en el horario junto a tus tareas. Google u Outlook se añaden en Ajustes → Calendario.',
      },
    },
    newsLabel: 'Novedades de Tasks',
    welcomeLabel: 'Bienvenida a Tasks',
    news: ['Hay cosas nuevas.', 'Pruébalas con el dedo antes de seguir.'],
    tagline: ['Tareas, rutinas y lugares.', `Todo se queda en tu ${device ?? 'dispositivo'}, sin cuentas.`],
    edition: 'Edición',
    index: 'Lo que vas a probar',
    seeNew: 'Ver lo nuevo',
    start: 'Empezar',
    skip: 'Saltar',
    known: 'Ya la conozco',
    back: 'Atrás',
    progress: (step: number, total: number) => `Lámina ${step} de ${total}`,
    done: 'Listo',
    next: 'Continuar',
  },
  en: {
    plates: {
      write: { kicker: 'Write', title: 'Write the way you talk.', text: 'The day, the time and the reminders come straight from the sentence.' },
      details: {
        kicker: 'Details',
        title: 'Everything, before adding.',
        text: 'Tap Details or pull the bar up: day, time, reminders and whether it repeats.',
      },
      dictate: {
        kicker: 'Dictate',
        title: 'Speak, no unlocking.',
        text: 'The microphone widget opens Tasks already listening, from the Lock Screen or the Action button. Tap it.',
      },
      swipe: { kicker: 'Gestures', title: 'One swipe and done.', text: 'Right, done. Left, gone. Try it.' },
      day: {
        kicker: 'Schedule',
        title: 'Drop it at its time.',
        text: 'Hold a task without a time and drag it up the schedule: it lands at the time you point to, in 15-minute steps.',
      },
      month: { kicker: 'Agenda', title: 'From week to month.', text: 'Pull the days down and jump to any date.' },
      basket: {
        kicker: 'Basket',
        title: 'Groceries, on the side.',
        text: '“Bread, milk and 2 kg of rice” becomes three rows. Tap them at the store and add the usual with one tap.',
      },
      routine: {
        kicker: 'Routines',
        title: 'The everyday things.',
        text: isNative
          ? 'Every morning they start unchecked. Check them off from the Lock Screen, too.'
          : 'Every morning they start unchecked, with their emoji and their streak.',
      },
      places: {
        kicker: 'Places',
        title: 'Right where it matters.',
        text: '“Call Miguel when I move” goes off 100 m from where you are; “when I leave home”, as you cross the circle. Drag your dot.',
      },
      suggest: {
        kicker: 'Suggestions',
        title: 'Circle it, say it.',
        text: 'In Settings, Suggest an improvement: circle what you’d change and write it down. Try it here.',
      },
      calendar: {
        kicker: 'Calendar',
        title: 'Your calendar, in your day.',
        text: 'Your iCloud, Google or Outlook events in your schedule, next to your tasks. Add Google or Outlook in Settings → Calendar.',
      },
    },
    newsLabel: 'What’s new in Tasks',
    welcomeLabel: 'Welcome to Tasks',
    news: ['There’s something new.', 'Try it with your finger before moving on.'],
    tagline: ['Tasks, routines and places.', `Everything stays on your ${device ?? 'device'}, no accounts.`],
    edition: 'Edition',
    index: 'What you will try',
    seeNew: 'See what’s new',
    start: 'Get started',
    skip: 'Skip',
    known: 'I know it already',
    back: 'Back',
    progress: (step: number, total: number) => `Card ${step} of ${total}`,
    done: 'Done',
    next: 'Continue',
  },
} as const

/** Las láminas se numeran según salen: tras una actualización, lo nuevo empieza en I. */
const NUMERALS = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII']
/** La versión de la app que se enseña en la portada de novedades (`Edición 1.8`): la PWA no tiene número. */
const EDITION = isNative && typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : ''

/** Lo que dura la salida (`.welcome.is-leaving` en welcome.css). */
const EXIT_MS = 420

/**
 * La bienvenida de la primera vez (y de Ajustes → «Ver la bienvenida»): una portada con la señal, que
 * toma el relevo de la pantalla de arranque sin que se note, y unas láminas que no explican la app
 * sino que dejan usarla: escribir una frase, desplegar sus detalles, deslizar una fila, desplegar el
 * mes, tachar una rutina.
 * Tras una actualización sale igual, con la portada de novedades y solo las láminas nuevas.
 * Nada obliga: se avanza con el botón, se vuelve atrás y «Saltar» está siempre a mano.
 */
export function Welcome({ run, quick = false, onReady, onDone }: WelcomeProps) {
  const copy = useCopy(COPY)
  // Lo que toca se fija al abrir: no cambia mientras se recorre. Tras actualizar, si lo nuevo no es de
  // esta plataforma no hay nada que enseñar (`welcomeOnLaunch` ya no la abre; esto es por si acaso).
  const [plates] = useState(() => {
    const due = platesAfter(PLATES, run.after)
    return due.length || run.news ? due : PLATES
  })
  // 0 es la portada; del 1 en adelante, las láminas.
  const [step, setStep] = useState(0)
  const [backwards, setBackwards] = useState(false)
  const [leaving, setLeaving] = useState(false)
  const exit = useRef<number | undefined>(undefined)
  const root = useRef<HTMLDivElement>(null)
  const callbacks = useRef({ onReady, onDone })
  callbacks.current = { onReady, onDone }

  useEffect(() => {
    callbacks.current.onReady?.()
    // Nada nuevo para esta plataforma: se da por vista sin enseñar nada.
    if (!plates.length) {
      callbacks.current.onDone()
      return
    }
    // La app de debajo queda inerte: el foco (y el lector de pantalla) pasan aquí.
    root.current?.focus({ preventScroll: true })
    return () => window.clearTimeout(exit.current)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const finish = () => {
    if (leaving) return
    haptic('success')
    setLeaving(true)
    exit.current = window.setTimeout(() => callbacks.current.onDone(), EXIT_MS)
  }

  const go = (next: number) => {
    haptic('selection')
    setBackwards(next < step)
    setStep(next)
  }

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') finish()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  })

  if (!plates.length) return null

  const plate = plates[step - 1]
  const text = plate ? copy.plates[plate.id] : null
  const last = step === plates.length
  const { news } = run
  const [first, second] = news ? copy.news : copy.tagline

  return createPortal(
    <div
      ref={root}
      tabIndex={-1}
      className={`welcome ${leaving ? 'is-leaving' : ''}`}
      role="dialog"
      aria-modal="true"
      aria-label={news ? copy.newsLabel : copy.welcomeLabel}
    >
      {!plate || !text ? (
        <section className={`welcome__cover ${backwards ? 'is-back' : ''} ${quick ? 'is-quick' : ''}`}>
          {/* En el centro exacto y del mismo tamaño que la del arranque: al fundirse aquella, queda esta. */}
          <svg className="welcome__mark" viewBox="0 0 100 100" aria-hidden="true">
            <path fill="currentColor" d={MARK_PATH} />
          </svg>
          <div className="welcome__hello">
            <i className="welcome__rule" aria-hidden="true" />
            {news && EDITION && (
              <p className="welcome__edition">
                {copy.edition} {EDITION}
              </p>
            )}
            <h1 className="welcome__name">Tasks</h1>
            <p className="welcome__tagline">
              {first}
              <br />
              {second}
            </p>
            {/* El índice: lo que viene, con su número, como el sumario de un cuaderno */}
            <ol className="welcome__index" aria-label={copy.index}>
              {plates.map((item, index) => (
                <li key={item.id} style={{ '--i': index } as CSSProperties}>
                  <span className="welcome__index-num">{NUMERALS[index] ?? index + 1}</span>
                  {copy.plates[item.id].kicker}
                </li>
              ))}
            </ol>
          </div>
          <footer className="welcome__foot">
            <button type="button" className="welcome__next" onClick={() => go(1)}>
              {news ? copy.seeNew : copy.start}
            </button>
            <button type="button" className="welcome__skip" onClick={finish}>
              {news ? copy.skip : copy.known}
            </button>
          </footer>
        </section>
      ) : (
        <>
          <header className="welcome__bar">
            <button type="button" className="welcome__back" aria-label={copy.back} onClick={() => go(step - 1)}>
              <IconChevronLeft size={20} />
            </button>
            <ol
              className="welcome__progress"
              role="progressbar"
              aria-valuemin={1}
              aria-valuemax={plates.length}
              aria-valuenow={step}
              aria-valuetext={copy.progress(step, plates.length)}
            >
              {plates.map((item, index) => (
                <li key={item.id} className={index < step - 1 ? 'is-done' : index === step - 1 ? 'is-current' : ''} />
              ))}
            </ol>
            <button type="button" className="welcome__skip" onClick={finish}>
              {copy.skip}
            </button>
          </header>
          <section key={plate.id} className={`welcome__plate ${backwards ? 'is-back' : ''}`}>
            <div className="welcome__stage">
              <plate.Scene />
            </div>
            <div className="welcome__copy">
              <p className="welcome__kicker">
                <span className="welcome__numeral">{NUMERALS[step - 1] ?? step}</span>
                {text.kicker}
              </p>
              <h1 className="welcome__title">{text.title}</h1>
              <p className="welcome__text">{text.text}</p>
            </div>
          </section>
          <footer className="welcome__foot">
            {/* Al final, "Listo": "Empezar" ya se dijo en la portada. */}
            <button type="button" className="welcome__next" onClick={last ? finish : () => go(step + 1)}>
              {last ? copy.done : copy.next}
            </button>
          </footer>
        </>
      )}
    </div>,
    document.body,
  )
}
