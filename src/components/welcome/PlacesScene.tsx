import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { CSSProperties, PointerEvent as ReactPointerEvent } from 'react'
import { haptic } from '../../lib/platform/feedback'
import { useCopy } from '../../state/LanguageProvider'
import { IconBell, IconCheck, IconHere, IconLeave, IconPin } from '../ui/Icons'
import { reducedMotion } from './motion'

type Trigger = 'arrive' | 'leave'

type ZoneId = 'home' | 'shop' | 'here'

interface Zone {
  id: ZoneId
  /** Centro, en proporción del plano. */
  x: number
  y: number
  /** Radio del círculo, en px. */
  r: number
  /** Qué aviso salta aquí y cuándo. */
  on: Trigger
}

/** Tu punto empieza en «aquí», que no es un lugar guardado: es donde estás al pedir el aviso. */
const ZONES: readonly Zone[] = [
  { id: 'here', x: 0.5, y: 0.52, r: 30, on: 'leave' },
  { id: 'home', x: 0.22, y: 0.7, r: 44, on: 'leave' },
  { id: 'shop', x: 0.77, y: 0.3, r: 40, on: 'arrive' },
]
const HERE = ZONES[0] as Zone

/** Lo que dura el aviso a la vista antes de recogerse. */
const BANNER_MS = 2800
/** Margen para que el punto no se salga del plano. */
const EDGE = 10

const COPY = {
  es: {
    names: { home: 'Casa', shop: 'Mercadona', here: 'Aquí · 100 m' },
    alerts: {
      here: { title: 'Llamar a Miguel', when: 'Al alejarme 100 m' },
      home: { title: 'Llamar a Carlota', when: 'Al salir de Casa' },
      shop: { title: 'Comprar pan', when: 'Al llegar a Mercadona' },
    },
    banner: { here: 'Te has alejado 100 m', home: 'Al salir de Casa', shop: 'Mercadona' },
    now: 'ahora',
    rang: 'Sonó',
    you: 'Tú',
    label: 'Un plano con tu punto, tu casa y el Mercadona. Arrastra tu punto: al alejarte 100 m, al pasar por casa y al llegar al Mercadona suena un aviso.',
  },
  en: {
    names: { home: 'Home', shop: 'Supermarket', here: 'Here · 100 m' },
    alerts: {
      here: { title: 'Call Miguel', when: 'Once I’m 100 m away' },
      home: { title: 'Call Carlota', when: 'Leaving Home' },
      shop: { title: 'Buy bread', when: 'Arriving at Supermarket' },
    },
    banner: { here: 'You’re 100 m away', home: 'Leaving Home', shop: 'Supermarket' },
    now: 'now',
    rang: 'Went off',
    you: 'You',
    label: 'A map with your dot, your home and the supermarket. Drag your dot: moving 100 m away, passing by home and arriving at the supermarket each set off an alert.',
  },
} as const

interface Size {
  w: number
  h: number
}

const centerOf = (zone: Zone, size: Size) => ({ x: zone.x * size.w, y: zone.y * size.h })
const insideOf = (zone: Zone, size: Size, point: { x: number; y: number }) => {
  const center = centerOf(zone, size)
  return Math.hypot(point.x - center.x, point.y - center.y) <= zone.r
}

/** El camino de muestra: de aquí al Mercadona pasando por casa, en px del plano. */
function demoPath(size: Size): string {
  const [here, home, shop] = ZONES.map((zone) => centerOf(zone, size))
  if (!here || !home || !shop) return ''
  const bend = { x: (home.x + shop.x) / 2 + size.w * 0.08, y: (home.y + shop.y) / 2 + size.h * 0.16 }
  return `M ${here.x} ${here.y} Q ${here.x - size.w * 0.12} ${home.y - 10} ${home.x + 4} ${home.y + 2} Q ${bend.x} ${bend.y} ${shop.x} ${shop.y}`
}

/**
 * Los avisos por lugar, con el dedo: un plano con tu punto («aquí», con su círculo de 100 m), tu casa y
 * el Mercadona, cada uno con su círculo. Al alejar el punto 100 m salta «Llamar a Miguel» (una vez: el
 * aviso se consume, como en el iPhone); al sacarlo de casa, «Al salir de Casa · Llamar a Carlota»; al
 * meterlo en el del Mercadona, «Comprar pan», y esos dos vuelven a sonar cada vez que se cruzan. Hasta el
 * primer toque, un punto de muestra hace el camino. Con movimiento reducido, se ve ya el aviso de aquí.
 */
export function PlacesScene() {
  const copy = useCopy(COPY)
  const plan = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState<Size | null>(null)
  const [you, setYou] = useState<{ x: number; y: number } | null>(null)
  const [touched, setTouched] = useState(false)
  const [banner, setBanner] = useState<{ zone: ZoneId; key: number } | null>(null)
  const [rang, setRang] = useState<Record<ZoneId, boolean>>({ here: false, home: false, shop: false })
  const dragging = useRef(false)
  const inside = useRef<Record<ZoneId, boolean>>({ here: true, home: false, shop: false })
  // El de aquí suena una vez: se guarda aparte del estado para decidirlo en el mismo movimiento.
  const spent = useRef(false)
  const hide = useRef<number | undefined>(undefined)
  const still = useRef(reducedMotion())

  useLayoutEffect(() => {
    const node = plan.current
    if (!node) return
    const measure = () => {
      const next = { w: node.clientWidth, h: node.clientHeight }
      setSize(next)
      // Al empezar, aquí (o, sin movimiento, ya a 100 m: el aviso a la vista).
      setYou((current) => {
        if (current) return current
        const center = centerOf(HERE, next)
        return still.current ? { x: center.x + HERE.r + 30, y: center.y - 14 } : { x: center.x, y: center.y }
      })
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(node)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (!still.current) return
    inside.current = { here: false, home: false, shop: false }
    spent.current = true
    setRang({ here: true, home: false, shop: false })
    setBanner({ zone: 'here', key: 0 })
  }, [])

  useEffect(() => () => window.clearTimeout(hide.current), [])

  const ring = (zone: ZoneId) => {
    haptic('success')
    setRang((current) => ({ ...current, [zone]: true }))
    setBanner({ zone, key: Date.now() })
    window.clearTimeout(hide.current)
    if (!still.current) hide.current = window.setTimeout(() => setBanner(null), BANNER_MS)
  }

  const moveTo = (event: ReactPointerEvent<HTMLDivElement>) => {
    const box = plan.current?.getBoundingClientRect()
    if (!box || !size) return
    const point = {
      x: Math.min(size.w - EDGE, Math.max(EDGE, event.clientX - box.left)),
      y: Math.min(size.h - EDGE, Math.max(EDGE, event.clientY - box.top)),
    }
    setYou(point)
    for (const zone of ZONES) {
      const now = insideOf(zone, size, point)
      const was = inside.current[zone.id]
      inside.current = { ...inside.current, [zone.id]: now }
      // Como iOS: el de salir suena al cruzar hacia fuera; el de llegar, hacia dentro. Cada vez, salvo
      // el de aquí, que se consume al sonar.
      if (zone.id === 'here') {
        if (was && !now && !spent.current) {
          spent.current = true
          ring(zone.id)
        }
        continue
      }
      if (zone.on === 'leave' && was && !now) ring(zone.id)
      if (zone.on === 'arrive' && !was && now) ring(zone.id)
    }
  }

  const onDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId)
    dragging.current = true
    if (!touched) haptic('selection')
    setTouched(true)
    moveTo(event)
  }

  const onMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (dragging.current) moveTo(event)
  }

  const onUp = () => {
    dragging.current = false
  }

  const path = size ? demoPath(size) : ''
  const showDemo = !touched && !still.current && size !== null

  return (
    <div className="scene scene--places">
      <div
        ref={plan}
        className={`scene__plan ${touched ? 'is-touched' : ''}`}
        role="img"
        aria-label={copy.label}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
      >
        <svg className="scene__paper" aria-hidden="true" preserveAspectRatio="xMidYMid slice" viewBox="0 0 400 300">
          <rect width="400" height="300" className="scene__land" />
          <path className="scene__water" d="M-10 262 C 70 238 140 284 220 258 S 350 236 410 252 L410 310 L-10 310 Z" />
          <g className="scene__roads">
            <path d="M-10 96 C 90 86 170 116 250 104 S 360 82 410 94" />
            <path d="M-10 200 C 80 190 180 214 260 196 S 360 178 410 188" />
            <path d="M74 -10 C 84 80 62 170 98 310" />
            <path d="M232 -10 C 222 90 258 160 240 310" />
          </g>
          <g className="scene__streets">
            <path d="M-10 148 L410 156" />
            <path d="M-10 42 L410 36" />
            <path d="M160 -10 L170 310" />
            <path d="M330 -10 L322 310" />
            <path d="M24 -10 L32 310" />
          </g>
        </svg>

        {showDemo && (
          <svg className="scene__route" aria-hidden="true" width={size.w} height={size.h}>
            <path d={path} pathLength={1} />
          </svg>
        )}

        {size &&
          ZONES.map((zone) => {
            const center = centerOf(zone, size)
            return (
              <div
                key={zone.id}
                className={`scene__zone scene__zone--${zone.on} ${zone.id === 'here' ? 'scene__zone--here' : ''} ${banner?.zone === zone.id ? 'is-ringing' : ''} ${zone.id === 'here' && rang.here ? 'is-spent' : ''}`}
                style={{ left: center.x, top: center.y, width: zone.r * 2, height: zone.r * 2 } as CSSProperties}
                aria-hidden="true"
              >
                <span className="scene__zone-name">
                  {zone.id === 'here' ? <IconHere size={11} strokeWidth={2.2} /> : <IconPin size={11} strokeWidth={2.2} />}
                  {copy.names[zone.id]}
                </span>
                {/* Cada vez que suena, una onda: la key la reinicia. */}
                {banner?.zone === zone.id && <i key={banner.key} className="scene__wave" />}
              </div>
            )
          })}

        {showDemo && <span className="scene__ghost-dot" style={{ offsetPath: `path('${path}')` } as CSSProperties} aria-hidden="true" />}

        {you && (
          <span className="scene__you" style={{ transform: `translate(${you.x}px, ${you.y}px)` }} aria-hidden="true">
            <i />
            <b>{copy.you}</b>
          </span>
        )}

        <div key={banner?.key} className={`scene__banner ${banner ? 'is-shown' : ''}`} aria-live="polite">
          {banner && (
            <>
              <span className="scene__banner-icon" aria-hidden="true">
                <IconCheck size={14} strokeWidth={2.6} />
              </span>
              <span className="scene__banner-text">
                <span className="scene__banner-head">
                  <b>{copy.banner[banner.zone]}</b>
                  <span>{copy.now}</span>
                </span>
                <span>{copy.alerts[banner.zone].title}</span>
              </span>
            </>
          )}
        </div>
      </div>

      <ul className="scene__alerts">
        {ZONES.map((zone) => (
          <li key={zone.id} className={`scene__alert ${rang[zone.id] ? 'is-rang' : ''}`}>
            <span className="scene__alert-icon" aria-hidden="true">
              {zone.id === 'here' ? <IconHere size={15} /> : zone.on === 'leave' ? <IconLeave size={15} /> : <IconPin size={15} />}
            </span>
            <span className="scene__alert-main">
              <span className="scene__alert-title">{copy.alerts[zone.id].title}</span>
              <span className="scene__alert-when">{copy.alerts[zone.id].when}</span>
            </span>
            <span className="scene__alert-state">
              {rang[zone.id] && (
                <>
                  <IconBell size={12} strokeWidth={2} />
                  {copy.rang}
                </>
              )}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
