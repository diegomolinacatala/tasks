import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { useResolvedTheme } from '../../hooks/useResolvedTheme'
import type { FramePoint, GeoPoint } from '../../lib/mapFrame'
import { framePoints } from '../../lib/mapFrame'
import { isNative } from '../../lib/platform'

interface MapSnapshotProps {
  points: readonly GeoPoint[]
  /** Centro y metros de norte a sur; sin ellos, el mapa encuadra `points`. */
  center?: GeoPoint
  span?: number
  height: number
  /** Metros: un círculo alrededor del centro (el radio de un lugar). */
  radius?: number
  /** Lo que se pinta en cada punto (su chincheta). */
  renderPin?: (index: number) => ReactNode
  className?: string
}

interface Shot {
  image: string
  points: FramePoint[]
}

/** Fotos ya hechas: volver a la pestaña o reabrir un lugar no vuelve a pedir el mapa. */
const cache = new Map<string, Shot>()
/** Cada foto es una imagen en base64 de cientos de kB: pocas. */
const CACHE_SIZE = 12

function remember(key: string, shot: Shot) {
  cache.set(key, shot)
  if (cache.size > CACHE_SIZE) cache.delete(cache.keys().next().value ?? '')
}

/**
 * Un mapa de Apple Maps hecho foto (en el iPhone, `TasksNative.mapSnapshot`): estilo apagado y sin
 * comercios, que no compite con los lugares. Mientras llega, o en la web, un plano dibujado con los
 * puntos en su sitio relativo. Las chinchetas y el círculo del radio van encima, en HTML.
 */
export function MapSnapshot({ points, center, span, height, radius, renderPin, className = '' }: MapSnapshotProps) {
  const box = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)
  const theme = useResolvedTheme()
  // Solo lo que cambia la foto: cambiar la dirección de un lugar no debe volver a pedirla.
  const coordinates = (point: GeoPoint) => [point.lat, point.lng]
  const key = JSON.stringify({ points: points.map(coordinates), center: center && coordinates(center), span, width, height, theme })
  const [shot, setShot] = useState<Shot | null>(() => cache.get(key) ?? null)

  useLayoutEffect(() => {
    const node = box.current
    if (!node) return
    setWidth(Math.round(node.offsetWidth))
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setWidth(Math.round(entry.contentRect.width))
    })
    observer.observe(node)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    const cached = cache.get(key)
    setShot(cached ?? null)
    if (cached || !isNative || !width || (!points.length && !center)) return
    let cancelled = false
    void import('../../lib/platform/native')
      .then(({ TasksNative }) =>
        TasksNative.mapSnapshot({
          points: points.map(({ lat, lng }) => ({ lat, lng })),
          ...(center ? { center: { lat: center.lat, lng: center.lng } } : {}),
          ...(span ? { span } : {}),
          width,
          height,
          dark: theme === 'dark',
        }),
      )
      .then((result) => {
        remember(key, result)
        if (!cancelled) setShot(result)
      })
      // Sin mapa (sin red, o un fallo de MapKit) se queda el plano dibujado.
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [key]) // eslint-disable-line react-hooks/exhaustive-deps

  const placed = shot?.points.length === points.length ? shot.points : framePoints(center && !points.length ? [center] : points)
  // Con centro y alto en metros, el radio se pinta a escala (sin salirse del marco mientras se arrastra
  // el deslizador: la foto se rehace, más amplia, al soltarlo).
  const circle = radius && span ? Math.min((radius / span) * height, height / 2 - 4) : null

  return (
    <div ref={box} className={`map ${shot ? 'is-loaded' : ''} ${className}`} style={{ height }}>
      <svg className="map__paper" aria-hidden="true" preserveAspectRatio="xMidYMid slice" viewBox="0 0 400 300">
        <rect width="400" height="300" className="map__land" />
        <path className="map__water" d="M-10 238 C 70 214 130 262 214 236 S 350 210 410 230 L410 310 L-10 310 Z" />
        <g className="map__roads">
          <path d="M-10 70 C 90 64 170 96 250 84 S 360 60 410 72" />
          <path d="M-10 170 C 80 160 180 186 260 168 S 360 150 410 160" />
          <path d="M60 -10 C 70 80 48 170 84 310" />
          <path d="M210 -10 C 200 90 236 160 218 310" />
          <path d="M320 -10 C 330 70 300 170 336 310" />
        </g>
        <g className="map__streets">
          <path d="M-10 120 L410 128" />
          <path d="M-10 32 L410 26" />
          <path d="M140 -10 L150 310" />
          <path d="M270 -10 L262 310" />
          <path d="M20 -10 L28 310" />
        </g>
      </svg>
      {shot && <img className="map__image" src={shot.image} alt="" draggable={false} />}
      {circle !== null && <span className="map__radius" style={{ width: circle * 2, height: circle * 2 }} aria-hidden="true" />}
      {renderPin &&
        placed.map((point, index) => (
          <span key={index} className="map__pin" style={{ left: `${point.x * 100}%`, top: `${point.y * 100}%` }}>
            {renderPin(index)}
          </span>
        ))}
    </div>
  )
}
