import { useEffect, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import type { ElementInfo, Point, Region, Viewport } from '../../lib/feedback'
import { isTap, regionOf, strokePath, tapRing } from '../../lib/feedback'
import { haptic } from '../../lib/platform/feedback'
import { useCopy } from '../../state/LanguageProvider'
import { elementsIn, openSheetTitle } from './describe'

/** Lo rodeado: el trazo (ya cerrado), su zona, lo que hay debajo y el panel que estaba abierto. */
export interface Mark {
  path: string
  region: Region | null
  elements: ElementInfo[]
  sheet: string | null
  /** La pantalla al rodear: la zona y el trazo van en sus píxeles (luego el teclado la encoge). */
  viewport: Viewport
}

/** Si el trazo acaba cerca de donde empezó, se cierra: rodear es dar la vuelta. */
const CLOSE_PX = 60

const COPY = {
  es: { hint: 'Rodea con el dedo lo que quieras comentar', cancel: 'Cancelar', skip: 'Sin rodear' },
  en: { hint: 'Circle with your finger what you want to comment on', cancel: 'Cancel', skip: 'Skip circling' },
} as const

/** El trazo de la mano de muestra: una vuelta un poco torcida, como se rodea de verdad. */
const DEMO_PATH = 'M150 22 C 205 24 232 52 222 80 C 210 112 140 122 88 114 C 34 106 6 84 14 56 C 22 28 70 14 132 18'

interface FeedbackDrawProps {
  /** La foto de la pantalla (iPhone); sin ella, se rodea sobre la app en vivo. */
  shot: string | null
  mark: Mark | null
  /** Se puede dibujar; si no, solo enseña lo rodeado detrás del panel. */
  live: boolean
  onStart: () => void
  onMark: (mark: Mark) => void
  onSkip: () => void
  onCancel: () => void
}

const viewport = () => ({ width: window.innerWidth, height: window.innerHeight })

/**
 * La pantalla congelada (o la app, en la web) bajo una capa en la que se dibuja con el dedo. El trazo
 * se pinta sin pasar por React: cada movimiento escribe el `d` del camino en el siguiente fotograma.
 */
export function FeedbackDraw({ shot, mark, live, onStart, onMark, onSkip, onCancel }: FeedbackDrawProps) {
  const copy = useCopy(COPY)
  // La mano de muestra hasta que se toca la pantalla por primera vez.
  const [touched, setTouched] = useState(false)
  const ink = useRef<SVGPathElement>(null)
  const points = useRef<Point[] | null>(null)
  const frame = useRef(0)

  useEffect(() => () => cancelAnimationFrame(frame.current), [])

  useEffect(() => {
    if (!live) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCancel()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [live, onCancel])

  const paint = () => {
    frame.current = 0
    if (points.current && ink.current) ink.current.setAttribute('d', strokePath(points.current))
  }

  const onDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!live || event.button > 0) return
    event.currentTarget.setPointerCapture(event.pointerId)
    points.current = [{ x: event.clientX, y: event.clientY }]
    setTouched(true)
    onStart()
    paint()
  }

  const onMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const current = points.current
    if (!current) return
    // Los movimientos que el navegador junta en uno: sin ellos, el trazo sale a tramos rectos.
    const events = event.nativeEvent.getCoalescedEvents?.() ?? []
    for (const item of events.length ? events : [event.nativeEvent]) current.push({ x: item.clientX, y: item.clientY })
    if (!frame.current) frame.current = requestAnimationFrame(paint)
  }

  const onUp = () => {
    const current = points.current
    points.current = null
    if (!current?.length) return
    const first = current[0]!
    const last = current[current.length - 1]!
    const outline = isTap(current)
      ? tapRing(last)
      : Math.hypot(last.x - first.x, last.y - first.y) < CLOSE_PX
        ? [...current, first]
        : current
    const screen = viewport()
    const region = regionOf(current, screen)
    haptic('tap')
    onMark({ path: strokePath(outline), region, elements: region ? elementsIn(region) : [], sheet: openSheetTitle(), viewport: screen })
  }

  // Un gesto del sistema (o un segundo dedo) se lleva el trazo: no se da por rodeado lo que quedó a medias.
  const onCancelStroke = () => {
    points.current = null
    ink.current?.setAttribute('d', mark?.path ?? '')
  }

  return (
    <div
      className={`fb-draw ${shot ? 'has-shot' : ''} ${live ? 'is-live' : ''}`}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onCancelStroke}
    >
      {shot && <img className="fb-draw__shot" src={shot} alt="" draggable={false} />}
      <svg className="fb-draw__ink" aria-hidden="true">
        <path ref={ink} d={mark?.path ?? ''} />
      </svg>
      {live && !touched && !mark && (
        <svg className="fb-demo" viewBox="0 0 240 132" aria-hidden="true">
          <path className="fb-demo__trace" d={DEMO_PATH} pathLength={1} />
          <circle className="fb-demo__tip" r="9" />
        </svg>
      )}
      {live && (
        <>
          <p className="fb-draw__hint">{copy.hint}</p>
          <div className="fb-draw__bar" onPointerDown={(event) => event.stopPropagation()}>
            <button type="button" className="chip" onClick={onCancel}>
              {copy.cancel}
            </button>
            <button type="button" className="chip" onClick={onSkip}>
              {copy.skip}
            </button>
          </div>
        </>
      )}
    </div>
  )
}
