import { useEffect, useRef, useState } from 'react'
import { haptic } from '../../lib/platform/feedback'
import { useCopy } from '../../state/LanguageProvider'
import { SwipeRow } from '../task/SwipeRow'
import { IconCheck, IconChevronLeft, IconChevronRight } from '../ui/Icons'

/** Lo que tarda en volver la fila borrada, para poder repetir el gesto. */
const RETURN_MS = 1500

const COPY = {
  es: { unmark: 'Desmarcar', complete: 'Completar', right: 'Desliza a la derecha', left: 'Desliza a la izquierda' },
  en: { unmark: 'Unmark', complete: 'Complete', right: 'Swipe right', left: 'Swipe left' },
} as const

/**
 * Dos filas de verdad (`SwipeRow`, el mismo gesto que en la app): una se tacha deslizándola a la
 * derecha y la otra se borra hacia la izquierda, y vuelve al rato para repetirlo. Hasta que se tocan,
 * se asoman solas hacia su lado para enseñar por dónde van.
 */
export function SwipeScene() {
  const copy = useCopy(COPY)
  const [done, setDone] = useState(false)
  const [gone, setGone] = useState(false)
  const [touched, setTouched] = useState(false)
  const comeback = useRef<number | undefined>(undefined)

  useEffect(() => () => window.clearTimeout(comeback.current), [])

  const toggle = () => {
    haptic('success')
    setDone((current) => !current)
  }

  const remove = () => {
    haptic('warning')
    setGone(true)
    comeback.current = window.setTimeout(() => setGone(false), RETURN_MS)
  }

  return (
    <div className="scene scene--swipe" onPointerDownCapture={() => setTouched(true)}>
      <ul className="column scene__rows">
        <SwipeRow className={`${done ? 'is-done' : ''} ${touched ? '' : 'is-hint-right'}`} onRight={toggle}>
          <div className="row">
            <button
              type="button"
              className="row__check"
              aria-pressed={done}
              aria-label={done ? copy.unmark : copy.complete}
              onClick={toggle}
            >
              <IconCheck size={13} strokeWidth={2.5} />
            </button>
            <span className="row__title">
              <span className="row__text">{copy.right}</span>
            </span>
            <IconChevronRight size={16} className="scene__arrow" />
          </div>
        </SwipeRow>
        {!gone && (
          <SwipeRow className={`scene__back ${touched ? '' : 'is-hint-left'}`} onLeft={remove}>
            <div className="row">
              <span className="row__check" aria-hidden="true" />
              <span className="row__title">
                <span className="row__text">{copy.left}</span>
              </span>
              <IconChevronLeft size={16} className="scene__arrow" />
            </div>
          </SwipeRow>
        )}
      </ul>
    </div>
  )
}
