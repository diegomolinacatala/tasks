import { useEffect, useState } from 'react'

/**
 * En móvil el teclado tapa la parte baja de la pantalla sin cambiar el layout.
 * Publicamos su altura en `--kb` para poder subir la barra inferior.
 */
export function useKeyboardInset(): boolean {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const viewport = window.visualViewport
    if (!viewport) return

    const update = () => {
      const inset = Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop)
      document.documentElement.style.setProperty('--kb', `${Math.round(inset)}px`)
      setOpen(inset > 120)
    }

    update()
    viewport.addEventListener('resize', update)
    viewport.addEventListener('scroll', update)
    return () => {
      viewport.removeEventListener('resize', update)
      viewport.removeEventListener('scroll', update)
      document.documentElement.style.removeProperty('--kb')
    }
  }, [])

  return open
}
