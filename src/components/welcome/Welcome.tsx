import { useEffect, useRef, useState } from 'react'
import type { ComponentType } from 'react'
import { createPortal } from 'react-dom'
import { MARK_PATH } from '../../lib/boot'
import { isNative } from '../../lib/platform'
import { haptic } from '../../lib/platform/feedback'
import type { PlateId, WelcomeRun } from '../../lib/welcome'
import { platesAfter } from '../../lib/welcome'
import { useCopy } from '../../state/LanguageProvider'
import { IconChevronLeft } from '../ui/Icons'
import { DetailsScene } from './DetailsScene'
import { MonthScene } from './MonthScene'
import { RoutineScene } from './RoutineScene'
import { SuggestScene } from './SuggestScene'
import { SwipeScene } from './SwipeScene'
import { WriteScene } from './WriteScene'
import './welcome.css'

interface WelcomeProps {
  /** Qué láminas tocan y si la portada presenta la app o anuncia lo nuevo (`lib/welcome.ts`). */
  run: WelcomeRun
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
  { id: 'swipe', Scene: SwipeScene },
  { id: 'month', Scene: MonthScene },
  { id: 'routine', Scene: RoutineScene },
  { id: 'suggest', Scene: SuggestScene },
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
      swipe: { kicker: 'Gestos', title: 'Un gesto y listo.', text: 'A la derecha, hecha. A la izquierda, fuera. Pruébalo.' },
      month: { kicker: 'Agenda', title: 'De la semana al mes.', text: 'Tira de los días hacia abajo y salta a cualquier fecha.' },
      routine: {
        kicker: 'Rutinas',
        title: 'Lo de cada día.',
        text: isNative
          ? 'Cada mañana amanecen sin tachar. Se tachan también desde la pantalla de bloqueo.'
          : 'Cada mañana amanecen sin tachar, con su emoji y su racha.',
      },
      suggest: {
        kicker: 'Sugerencias',
        title: 'Rodéalo y cuéntalo.',
        text: 'En Ajustes, Sugerir una mejora: rodea con el dedo lo que cambiarías y escríbelo. Pruébalo aquí.',
      },
    },
    newsLabel: 'Novedades de Tasks',
    welcomeLabel: 'Bienvenida a Tasks',
    news: ['Hay cosas nuevas.', 'Pruébalas con el dedo antes de seguir.'],
    tagline: ['Tareas, rutinas y lugares.', `Todo se queda en tu ${device ?? 'dispositivo'}, sin cuentas.`],
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
      swipe: { kicker: 'Gestures', title: 'One swipe and done.', text: 'Right, done. Left, gone. Try it.' },
      month: { kicker: 'Agenda', title: 'From week to month.', text: 'Pull the days down and jump to any date.' },
      routine: {
        kicker: 'Routines',
        title: 'The everyday things.',
        text: isNative
          ? 'Every morning they start unchecked. Check them off from the Lock Screen, too.'
          : 'Every morning they start unchecked, with their emoji and their streak.',
      },
      suggest: {
        kicker: 'Suggestions',
        title: 'Circle it, say it.',
        text: 'In Settings, Suggest an improvement: circle what you’d change and write it down. Try it here.',
      },
    },
    newsLabel: 'What’s new in Tasks',
    welcomeLabel: 'Welcome to Tasks',
    news: ['There’s something new.', 'Try it with your finger before moving on.'],
    tagline: ['Tasks, routines and places.', `Everything stays on your ${device ?? 'device'}, no accounts.`],
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
const NUMERALS = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X']

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
export function Welcome({ run, onReady, onDone }: WelcomeProps) {
  const copy = useCopy(COPY)
  // Lo que toca se fija al abrir: no cambia mientras se recorre.
  const [plates] = useState(() => {
    const due = platesAfter(PLATES, run.after)
    return due.length ? due : PLATES
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
    // La app de debajo queda inerte: el foco (y el lector de pantalla) pasan aquí.
    root.current?.focus({ preventScroll: true })
    return () => window.clearTimeout(exit.current)
  }, [])

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
        <section className={`welcome__cover ${backwards ? 'is-back' : ''}`}>
          {/* En el centro exacto y del mismo tamaño que la del arranque: al fundirse aquella, queda esta. */}
          <svg className="welcome__mark" viewBox="0 0 100 100" aria-hidden="true">
            <path fill="currentColor" d={MARK_PATH} />
          </svg>
          <div className="welcome__hello">
            <i className="welcome__rule" aria-hidden="true" />
            <h1 className="welcome__name">Tasks</h1>
            <p className="welcome__tagline">
              {first}
              <br />
              {second}
            </p>
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
            <ol className="welcome__progress" aria-label={copy.progress(step, plates.length)}>
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
            <button type="button" className="welcome__next" onClick={last ? finish : () => go(step + 1)}>
              {last ? (news ? copy.done : copy.start) : copy.next}
            </button>
          </footer>
        </>
      )}
    </div>,
    document.body,
  )
}
