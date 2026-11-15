import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { haptic } from '../../lib/platform/feedback'
import { useCopy } from '../../state/LanguageProvider'
import { QrCode } from '../sync/QrCode'
import { IconCheck, IconLock } from '../ui/Icons'
import { MiniList, useFlash } from './MiniList'
import type { MiniItem } from './MiniList'
import { reducedMotion } from './motion'
import './sync-plates.css'

const COPY = {
  es: {
    site: 'Tasks en el ordenador',
    scan: 'Escanéalo con el iPhone',
    tapToScan: 'Toca para escanear',
    scanning: 'Escaneando…',
    laptopList: 'En el ordenador',
    phoneList: 'En el iPhone',
    digits: 'Las mismas cifras',
    link: 'Vincular',
    linked: 'Vinculado',
    unlinked: 'Sin vincular',
    check: 'Comprueba las cifras',
    day: 'Tu día',
    typing: 'Reservar mesa para 4',
    write: 'Escribe una tarea…',
    items: [
      { title: 'Cena con Carlota', meta: '21:00' },
      { title: 'Llamar a Ibán', meta: 'Hoy' },
      { title: 'Regalo para Sarita', meta: 'Esta semana' },
    ],
    label:
      'Un ordenador con Tasks abierto enseña un código; el iPhone lo escanea, los dos enseñan las mismas cifras y, vinculados, lo que se toca en uno cambia en el otro.',
  },
  en: {
    site: 'Tasks on the computer',
    scan: 'Scan it with your iPhone',
    tapToScan: 'Tap to scan',
    scanning: 'Scanning…',
    laptopList: 'On the computer',
    phoneList: 'On the iPhone',
    digits: 'Same digits',
    link: 'Link',
    linked: 'Linked',
    unlinked: 'Not linked',
    check: 'Check the digits',
    day: 'Your day',
    typing: 'Book a table for 4',
    write: 'Write a task…',
    items: [
      { title: 'Dinner with Carlota', meta: '9 PM' },
      { title: 'Call Ibán', meta: 'Today' },
      { title: 'Gift for Sarita', meta: 'This week' },
    ],
    label:
      'A computer with Tasks open shows a code; the iPhone scans it, both show the same digits and, once linked, whatever you tap on one changes on the other.',
  },
} as const

type Phase = 'qr' | 'scan' | 'code' | 'linked'

const DIGITS = '4815'
/** Lo que tarda el iPhone en ir hasta el código y leerlo. */
const SCAN_MS = 900
/** Ya vinculados, cuándo empieza el ordenador a escribir una tarea. */
const TYPE_START_MS = 1400
const TYPE_MS = 55
const DEMO = 'tasks://link/demo#tasks'

/**
 * Vincular con el ordenador, con el dedo: el ordenador enseña su código; tocar el iPhone lo escanea, los
 * dos enseñan las mismas cifras y «Vincular» los une. Después, la misma lista en los dos: tachar en uno
 * se ilumina en el otro, y el ordenador escribe una tarea que llega sola al iPhone. Con el movimiento
 * reducido, ya vinculados.
 */
export function LinkScene() {
  const copy = useCopy(COPY)
  const still = useMemo(reducedMotion, [])
  const [phase, setPhase] = useState<Phase>(still ? 'linked' : 'qr')
  const [items, setItems] = useState<MiniItem[]>(() => {
    const base = copy.items.map((item, index) => ({ id: index + 1, ...item, done: false }))
    // Sin movimiento, el resultado: también la tarea que el ordenador habría escrito.
    return still ? [...base, { id: 100, title: copy.typing, meta: copy.items[1].meta, done: false }] : base
  })
  const [typed, setTyped] = useState(still ? -1 : 0)
  const [laptopFlash, flashLaptop] = useFlash()
  const [phoneFlash, flashPhone] = useFlash()
  const timer = useRef<number | undefined>(undefined)
  const focusNext = useRef<HTMLElement | null>(null)
  const touched = useRef(false)

  useEffect(() => () => window.clearTimeout(timer.current), [])

  // El botón que se toca desaparece al cambiar de fase: el foco pasa al siguiente (o a cómo va el vínculo),
  // para quien va con teclado o lector. Solo después de un toque: al abrir la lámina no se mueve.
  useLayoutEffect(() => {
    if (touched.current) focusNext.current?.focus({ preventScroll: true })
  }, [phase])

  // Ya vinculados, el ordenador escribe una tarea y le llega al iPhone. Solo una vez (`typed` -1 = hecho).
  useEffect(() => {
    if (phase !== 'linked' || typed < 0) return
    const wait = typed === 0 ? TYPE_START_MS : typed < copy.typing.length ? TYPE_MS + ((typed * 7) % 30) : 500
    const id = window.setTimeout(() => {
      if (typed < copy.typing.length) {
        setTyped((count) => count + 1)
        return
      }
      const added = { id: 100, title: copy.typing, meta: copy.items[1].meta, done: false }
      setItems((current) => [...current, added])
      setTyped(-1)
      flashPhone(added.id)
      haptic('tap')
    }, wait)
    return () => window.clearTimeout(id)
  }, [phase, typed, copy, flashPhone])

  const scan = () => {
    if (phase !== 'qr') return
    touched.current = true
    haptic('selection')
    setPhase('scan')
    timer.current = window.setTimeout(() => {
      haptic('success')
      setPhase('code')
    }, SCAN_MS)
  }

  const link = () => {
    if (phase !== 'code') return
    touched.current = true
    haptic('success')
    setPhase('linked')
  }

  // Tachar en un lado se ilumina en el otro: así se ve que viaja.
  const toggleFrom = (side: 'laptop' | 'phone') => (id: number) => {
    const item = items.find((entry) => entry.id === id)
    haptic(item?.done ? 'tap' : 'success')
    setItems((current) => current.map((entry) => (entry.id === id ? { ...entry, done: !entry.done } : entry)))
    if (side === 'laptop') flashPhone(id)
    else flashLaptop(id)
  }

  const linked = phase === 'linked'
  const typing = linked && typed > 0 ? copy.typing.slice(0, typed) : ''

  return (
    <div className={`scene scene--link is-${phase}`}>
      <p className="sr-only">{copy.label}</p>
      <div className="scene__laptop">
        <div className="scene__laptop-screen">
          <div className="scene__laptop-bar" aria-hidden="true">
            <i />
            <i />
            <i />
            <span>{copy.site}</span>
          </div>
          {linked ? (
            <div className="scene__laptop-app">
              <p className="scene__device-head">{copy.day}</p>
              <MiniList label={copy.laptopList} items={items} flash={laptopFlash} onToggle={toggleFrom('laptop')} />
              <p className={`scene__laptop-write ${typing ? '' : 'is-empty'}`} aria-hidden="true">
                {typing || copy.write}
                {typed > 0 && <i className="scene__caret" />}
              </p>
            </div>
          ) : (
            <div className="scene__laptop-pair">
              {phase === 'code' ? (
                <>
                  <p className="scene__digits">{DIGITS}</p>
                  <p className="scene__laptop-hint">{copy.digits}</p>
                </>
              ) : (
                <>
                  <QrCode value={DEMO} label={copy.scan} size={92} />
                  <p className="scene__laptop-hint">{copy.scan}</p>
                </>
              )}
            </div>
          )}
        </div>
        <div className="scene__laptop-base" aria-hidden="true" />
      </div>

      <div className="scene__phone">
        <div className="scene__phone-screen">
          {phase === 'qr' || phase === 'scan' ? (
            <button type="button" className="scene__viewfinder" onClick={scan} aria-busy={phase === 'scan'}>
              <span className="scene__viewfinder-frame" aria-hidden="true" />
              <span className="scene__viewfinder-text">{phase === 'scan' ? copy.scanning : copy.tapToScan}</span>
            </button>
          ) : phase === 'code' ? (
            <div className="scene__phone-pair">
              <p className="scene__digits scene__digits--small">{DIGITS}</p>
              <button ref={(node) => void (focusNext.current = node)} type="button" className="scene__phone-link" onClick={link}>
                {copy.link}
              </button>
            </div>
          ) : (
            <MiniList label={copy.phoneList} items={items} flash={phoneFlash} onToggle={toggleFrom('phone')} compact />
          )}
        </div>
      </div>

      {/* Cómo va: sin vincular, las cifras y, unidos, cifrado */}
      <p
        ref={(node) => {
          if (linked) focusNext.current = node
        }}
        tabIndex={-1}
        className="scene__linked"
        aria-live="polite"
        aria-atomic="true"
      >
        {linked && <IconCheck size={11} strokeWidth={3} />}
        {linked ? copy.linked : phase === 'code' ? copy.check : copy.unlinked}
        <IconLock size={11} strokeWidth={2.2} />
      </p>
    </div>
  )
}
