import type { Viewport } from '../../lib/feedback'
import { MAX_SHOT_CHARS } from '../../lib/feedback'

/** Más nitidez que esto no ayuda a ver de qué se habla y engorda la foto. */
const MAX_SCALE = 2
const QUALITIES = [0.72, 0.55, 0.4]
const PREFIX = 'data:image/jpeg;base64,'.length

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('captura ilegible'))
    image.src = src
  })
}

/**
 * La captura con el trazo encima, en un JPEG que cabe en el buzón. `path` va en píxeles CSS de la
 * pantalla (`viewport`); la foto se estira a ella igual que en la capa del dibujo (`object-fit: fill`),
 * así el trazo cae donde se dibujó aunque la foto del iPhone tenga otra proporción.
 */
export async function composeShot(shot: string, path: string, viewport: Viewport, color: string): Promise<string | null> {
  const image = await loadImage(shot)
  const scale = Math.max(1, Math.min(MAX_SCALE, image.naturalWidth / viewport.width))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(viewport.width * scale)
  canvas.height = Math.round(viewport.height * scale)
  const context = canvas.getContext('2d')
  if (!context) return null
  context.drawImage(image, 0, 0, canvas.width, canvas.height)
  if (path) {
    context.scale(scale, scale)
    const stroke = new Path2D(path)
    context.lineCap = 'round'
    context.lineJoin = 'round'
    // Un halo claro debajo: el trazo se ve sobre cualquier fondo, también en el modo oscuro.
    context.strokeStyle = 'rgba(255, 255, 255, 0.8)'
    context.lineWidth = 9
    context.stroke(stroke)
    context.strokeStyle = color
    context.lineWidth = 4.5
    context.stroke(stroke)
  }
  for (const quality of QUALITIES) {
    const data = canvas.toDataURL('image/jpeg', quality)
    if (data.length - PREFIX <= MAX_SHOT_CHARS) return data
  }
  return null
}
