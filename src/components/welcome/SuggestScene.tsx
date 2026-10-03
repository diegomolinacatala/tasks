import { useEffect, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import type { Point } from '../../lib/feedback'
import { isTap, strokePath, tapRing } from '../../lib/feedback'
import { haptic } from '../../lib/platform/feedback'
import { useCopy } from '../../state/LanguageProvider'
import { IconCheck, IconFeather } from '../ui/Icons'

/** Lo que tarda en volver a empezar tras "enviar", para poder repetirlo. */
const RESET_MS = 2200

const COPY = {
  es: {
    rows: [
      { title: 'Cena con Carlota', meta: 'Vie · 21:00' },
      { title: 'Comprar flores', meta: 'Al pasar por la floristería' },
      { title: 'Tomar creatina', meta: 'Cada día · 10:00' },
    ],
    about: (title: string) => `Sobre «${title}»`,
    message: '¿Y si saliera también el sitio?',
    send: 'Enviar',
    sent: 'Enviada. ¡Gracias!',
  },
  en: {
    rows: [
      { title: 'Dinner with Carlota', meta: 'Fri · 9:00 PM' },
      { title: 'Buy flowers', meta: 'When passing the florist' },
      { title: 'Take creatine', meta: 'Every day · 10:00 AM' },
    ],
    about: (title: string) => `About “${title}”`,
    message: 'Could it show the place too?',
    send: 'Send',
    sent: 'Sent. Thank you!',
  },
} as const

/** La vuelta de la mano de muestra, alrededor de la primera fila (en el `viewBox` de la escena). */
const DEMO_PATH = 'M210 14 C 262 16 288 34 284 52 C 278 74 210 82 140 80 C 70 78 18 70 16 48 C 14 26 70 12 180 12'

/**
 * Las sugerencias, con el dedo: una lista de mentira (con la cena con Carlota arriba) sobre la que se
 * rodea lo que se quiera, como en la app. Hasta el primer toque, una mano de muestra rodea la cena.
 * Al soltar sale la sugerencia sobre esa fila, lista para enviar.
 */
export function SuggestScene() {
  const copy = useCopy(COPY)
  const [touched, setTouched] = useState(false)
  const [picked, setPicked] = useState<number | null>(null)
  const [path, setPath] = useState('')
  const [sent, setSent] = useState(false)
  const points = useRef<Point[] | null>(null)
  const ink = useRef<SVGPathElement>(null)
  const screen = useRef<HTMLDivElement>(null)
  const rows = useRef<(HTMLLIElement | null)[]>([])
  const reset = useRef<number | undefined>(undefined)

  useEffect(() => () => window.clearTimeout(reset.current), [])

  const local = (event: ReactPointerEvent): Point => {
    const box = screen.current?.getBoundingClientRect()
    return { x: event.clientX - (box?.left ?? 0), y: event.clientY - (box?.top ?? 0) }
  }

  const onDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (sent) return
    event.currentTarget.setPointerCapture(event.pointerId)
    points.current = [local(event)]
    setTouched(true)
    setPicked(null)
    setPath('')
    ink.current?.setAttribute('d', '')
  }

  const onMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!points.current) return
    points.current.push(local(event))
    ink.current?.setAttribute('d', strokePath(points.current))
  }

  const onUp = () => {
    const current = points.current
    points.current = null
    if (!current?.length) return
    const outline = isTap(current) ? tapRing(current[current.length - 1]!, 28) : [...current, current[0]!]
    setPath(strokePath(outline))
    // La fila que cae en medio de lo rodeado.
    const middle = current.reduce((sum, point) => sum + point.y, 0) / current.length
    const top = screen.current?.getBoundingClientRect().top ?? 0
    const index = rows.current.findIndex((row) => {
      const box = row?.getBoundingClientRect()
      return box ? middle + top >= box.top - 8 && middle + top <= box.bottom + 8 : false
    })
    setPicked(index >= 0 ? index : 0)
    haptic('tap')
  }

  const send = () => {
    haptic('success')
    setSent(true)
    reset.current = window.setTimeout(() => {
      setSent(false)
      setPicked(null)
      setPath('')
    }, RESET_MS)
  }

  const title = picked !== null ? copy.rows[picked]?.title : null

  return (
    <div className="scene scene--suggest">
      <div
        ref={screen}
        className="scene__screen"
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={() => (points.current = null)}
      >
        <ul className="scene__list scene__list--plain">
          {copy.rows.map((row, index) => (
            <li
              key={row.title}
              ref={(node) => {
                rows.current[index] = node
              }}
              className="scene__row"
            >
              <span className="row__check" aria-hidden="true" />
              <span className="scene__row-main">
                <span className="row__title">{row.title}</span>
                <span className="scene__meta">{row.meta}</span>
              </span>
            </li>
          ))}
        </ul>
        <svg className="scene__ink" aria-hidden="true">
          <path ref={ink} d={path} />
        </svg>
        {!touched && (
          <svg className="scene__demo" viewBox="0 0 300 96" preserveAspectRatio="none" aria-hidden="true">
            <path className="scene__demo-trace" d={DEMO_PATH} pathLength={1} />
          </svg>
        )}
      </div>
      <div className={`scene__note ${title ? 'is-shown' : ''}`} aria-live="polite">
        {sent ? (
          <p className="scene__note-sent">
            <IconCheck size={15} strokeWidth={2.5} />
            {copy.sent}
          </p>
        ) : (
          title && (
            <>
              <p className="scene__note-about">
                <IconFeather size={14} />
                {copy.about(title)}
              </p>
              <p className="scene__note-text">{copy.message}</p>
              <button type="button" className="chip is-active scene__note-send" onClick={send}>
                {copy.send}
              </button>
            </>
          )
        )}
      </div>
    </div>
  )
}
