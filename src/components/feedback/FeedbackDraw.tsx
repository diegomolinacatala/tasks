import { useEffect, useRef } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import type { ElementInfo, Point, Region } from '../../lib/feedback'
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
}

/** Si el trazo acaba cerca de donde empezó, se cierra: rodear es dar la vuelta. */
const CLOSE_PX = 60

const COPY = {
  es: { hint: 'Rodéalo con el dedo', cancel: 'Cancelar', skip: 'Sin rodear' },
  en: { hint: 'Circle it with your finger', cancel: 'Cancel', skip: 'Skip circling' },
} as const

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
    const region = regionOf(current, viewport())
    haptic('tap')
    onMark({ path: strokePath(outline), region, elements: region ? elementsIn(region) : [], sheet: openSheetTitle() })
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
