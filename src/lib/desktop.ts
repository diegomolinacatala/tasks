import { useEffect, useState } from 'react'
import { isNative } from './platform'

/**
 * Un ordenador con ventana ancha y ratón: la app se abre en tres columnas (Bandeja, Agenda y la cesta) en
 * vez de pestañas. El iPhone nunca, aunque esté en horizontal.
 */
const QUERY = '(min-width: 1080px) and (hover: hover) and (pointer: fine)'

const matches = () => !isNative && typeof matchMedia === 'function' && matchMedia(QUERY).matches

export function useDesktop(): boolean {
  const [desktop, setDesktop] = useState(matches)
  useEffect(() => {
    if (isNative || typeof matchMedia !== 'function') return
    const media = matchMedia(QUERY)
    const onChange = () => setDesktop(media.matches)
    media.addEventListener('change', onChange)
    return () => media.removeEventListener('change', onChange)
  }, [])
  return desktop
}

/** Un atajo de teclado que no debe saltar mientras se escribe en un campo. */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  return target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)
}
