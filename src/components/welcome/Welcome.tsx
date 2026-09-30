import { useEffect, useRef, useState } from 'react'
import type { ComponentType } from 'react'
import { createPortal } from 'react-dom'
import { MARK_PATH } from '../../lib/boot'
import { isNative } from '../../lib/platform'
import { haptic } from '../../lib/platform/feedback'
import { IconChevronLeft } from '../ui/Icons'
import { MonthScene } from './MonthScene'
import { RoutineScene } from './RoutineScene'
import { SwipeScene } from './SwipeScene'
import { WriteScene } from './WriteScene'
import './welcome.css'

interface WelcomeProps {
  /** Ya está pintada: se puede fundir la pantalla de arranque que tiene encima. */
  onReady?: () => void
  onDone: () => void
}

interface Plate {
  id: string
  numeral: string
  kicker: string
  title: string
  text: string
  Scene: ComponentType
}

/** Cada lámina es un trozo de la app de verdad, para probarlo con el dedo antes de empezar. */
const PLATES: readonly Plate[] = [
  {
    id: 'write',
    numeral: 'I',
    kicker: 'Escribir',
    title: 'Escribe como hablas.',
    text: 'El día, la hora y los avisos salen solos de la frase.',
    Scene: WriteScene,
  },
  {
    id: 'swipe',
    numeral: 'II',
    kicker: 'Gestos',
    title: 'Un gesto y listo.',
    text: 'A la derecha, hecha. A la izquierda, fuera. Pruébalo.',
    Scene: SwipeScene,
  },
  {
    id: 'month',
    numeral: 'III',
    kicker: 'Agenda',
    title: 'De la semana al mes.',
    text: 'Tira de los días hacia abajo y salta a cualquier fecha.',
    Scene: MonthScene,
  },
  {
    id: 'routine',
    numeral: 'IV',
    kicker: 'Rutinas',
    title: 'Lo de cada día.',
    text: isNative
      ? 'Cada mañana amanecen sin tachar. Se tachan también desde la pantalla de bloqueo.'
      : 'Cada mañana amanecen sin tachar, con su emoji y su racha.',
    Scene: RoutineScene,
  },
]

/** Lo que dura la salida (`.welcome.is-leaving` en welcome.css). */
const EXIT_MS = 420

/**
 * La bienvenida de la primera vez (y de Ajustes → «Ver la bienvenida»): una portada con la señal, que
 * toma el relevo de la pantalla de arranque sin que se note, y cuatro láminas que no explican la app
 * sino que dejan usarla: escribir una frase, deslizar una fila, desplegar el mes, tachar una rutina.
 * Nada obliga: se avanza con el botón, se vuelve atrás y «Saltar» está siempre a mano.
 */
export function Welcome({ onReady, onDone }: WelcomeProps) {
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

  const plate = PLATES[step - 1]
  const last = step === PLATES.length

  return createPortal(
    <div ref={root} tabIndex={-1} className={`welcome ${leaving ? 'is-leaving' : ''}`} role="dialog" aria-modal="true" aria-label="Bienvenida a Tasks">
      {!plate ? (
        <section className={`welcome__cover ${backwards ? 'is-back' : ''}`}>
          {/* En el centro exacto y del mismo tamaño que la del arranque: al fundirse aquella, queda esta. */}
          <svg className="welcome__mark" viewBox="0 0 100 100" aria-hidden="true">
            <path fill="currentColor" d={MARK_PATH} />
          </svg>
          <div className="welcome__hello">
            <i className="welcome__rule" aria-hidden="true" />
            <h1 className="welcome__name">Tasks</h1>
            <p className="welcome__tagline">
              Tareas, rutinas y lugares.
              <br />
              Todo se queda en tu {isNative ? 'iPhone' : 'dispositivo'}, sin cuentas.
            </p>
          </div>
          <footer className="welcome__foot">
            <button type="button" className="welcome__next" onClick={() => go(1)}>
              Empezar
            </button>
            <button type="button" className="welcome__skip" onClick={finish}>
              Ya la conozco
            </button>
          </footer>
        </section>
      ) : (
        <>
          <header className="welcome__bar">
            <button type="button" className="welcome__back" aria-label="Atrás" onClick={() => go(step - 1)}>
              <IconChevronLeft size={20} />
            </button>
            <ol className="welcome__progress" aria-label={`Lámina ${step} de ${PLATES.length}`}>
              {PLATES.map((item, index) => (
                <li key={item.id} className={index < step - 1 ? 'is-done' : index === step - 1 ? 'is-current' : ''} />
              ))}
            </ol>
            <button type="button" className="welcome__skip" onClick={finish}>
              Saltar
            </button>
          </header>
          <section key={plate.id} className={`welcome__plate ${backwards ? 'is-back' : ''}`}>
            <div className="welcome__stage">
              <plate.Scene />
            </div>
            <div className="welcome__copy">
              <p className="welcome__kicker">
                <span className="welcome__numeral">{plate.numeral}</span>
                {plate.kicker}
              </p>
              <h1 className="welcome__title">{plate.title}</h1>
              <p className="welcome__text">{plate.text}</p>
            </div>
          </section>
          <footer className="welcome__foot">
            <button type="button" className="welcome__next" onClick={last ? finish : () => go(step + 1)}>
              {last ? 'Empezar' : 'Continuar'}
            </button>
          </footer>
        </>
      )}
    </div>,
    document.body,
  )
}
