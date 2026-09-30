/**
 * Encuadre de un plano sin mapa de verdad (mientras llega el de Apple Maps, o en la web): los puntos
 * se proyectan en línea recta dentro de su caja, con margen. Basta para situarlos unos respecto a
 * otros; las distancias de verdad las da el mapa nativo.
 */

export interface GeoPoint {
  lat: number
  lng: number
}

export interface FramePoint {
  /** De 0 a 1, de izquierda a derecha. */
  x: number
  /** De 0 a 1, de arriba abajo. */
  y: number
}

/**
 * Márgenes de la caja. Arriba cabe la cabeza de la chincheta; abajo, su nombre y el buscador que
 * flota sobre el borde del mapa; a los lados, medio nombre.
 */
const LEFT = 0.18
const RIGHT = 0.82
const TOP = 0.26
const BOTTOM = 0.68

export function framePoints(points: readonly GeoPoint[]): FramePoint[] {
  if (!points.length) return []
  const lats = points.map((point) => point.lat)
  const lngs = points.map((point) => point.lng)
  const [minLat, maxLat] = [Math.min(...lats), Math.max(...lats)]
  const [minLng, maxLng] = [Math.min(...lngs), Math.max(...lngs)]
  const place = (value: number, min: number, max: number, from: number, to: number) =>
    max > min ? from + ((value - min) / (max - min)) * (to - from) : (from + to) / 2
  return points.map((point) => ({
    x: place(point.lng, minLng, maxLng, LEFT, RIGHT),
    y: place(point.lat, minLat, maxLat, BOTTOM, TOP),
  }))
}
