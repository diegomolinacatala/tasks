import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { acquireModal, releaseModal } from '../../lib/modal'
import { track } from '../../lib/stats/bus'
import { useCopy } from '../../state/LanguageProvider'
import { IconBasket } from '../ui/Icons'
import { BasketPanel } from './BasketPanel'
import './basket.css'

/** Lo que dura el fundido de cierre (`--dur-2`): hasta entonces no se desmonta. */
const EXIT_MS = 220

const COPY = {
  es: { title: 'Cesta', close: 'Cerrar la cesta' },
  en: { title: 'Basket', close: 'Close the basket' },
} as const

interface BasketPopoverProps {
  open: boolean
  onClose: () => void
}

/**
 * La cesta: la lista de la compra, en un popover que se despliega desde el icono de la cabecera sin
 * ocupar la pantalla. Arriba, el campo para añadir ("pan, leche y huevos" son tres; "2 kg de arroz"
 * lleva cantidad) y las habituales (lo más comprado otras veces, de un toque); después lo pendiente,
 * que se tacha tocándolo o deslizando a la derecha (a la izquierda se quita, con deshacer); lo
 * comprado se pliega en una línea, con "Vaciar" dentro. En el iPhone, al pie, la tienda en la que
 * avisa al llegar con lo pendiente. Como un panel: la app de debajo queda inerte y el velo, el
 * icono o Escape la cierran.
 */
export function BasketPopover({ open, onClose }: BasketPopoverProps) {
  const copy = useCopy(COPY)
  const [mounted, setMounted] = useState(open)
  const [shown, setShown] = useState(false)
  // Desde cuándo está abierta: lo comprado desde entonces se queda a la vista, tachado, al final de lo
  // pendiente (se ve el círculo llenarse y un toque de más se arregla con otro); solo lo de antes se pliega.
  const [openedAt, setOpenedAt] = useState(() => Date.now())
  const panel = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (open) {
      setMounted(true)
      setOpenedAt(Date.now())
      const frame = requestAnimationFrame(() => setShown(true))
      return () => cancelAnimationFrame(frame)
    }
    setShown(false)
    const timer = setTimeout(() => setMounted(false), EXIT_MS)
    return () => clearTimeout(timer)
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      // Con un panel encima (compartir, una cesta nueva), Escape es suyo.
      if (event.key === 'Escape' && !document.querySelector('.sheet--over')) onClose()
    }
    document.addEventListener('keydown', onKey)
    // Un popover deja el pie libre: el toast se queda abajo, donde siempre.
    acquireModal('popover')
    track('sheet/basket')
    const frame = requestAnimationFrame(() => panel.current?.focus({ preventScroll: true }))
    return () => {
      cancelAnimationFrame(frame)
      document.removeEventListener('keydown', onKey)
      releaseModal()
    }
  }, [open, onClose])

  if (!mounted) return null

  return createPortal(
    <div className={`basket ${shown ? 'is-open' : ''}`} role="dialog" aria-modal="true" aria-label={copy.title} data-screen="basket">
      <button type="button" className="basket__scrim" aria-label={copy.close} onClick={onClose} />
      {/* El icono, en su sitio y encendido: tocarlo pliega la cesta; el pico la une a él. */}
      <button type="button" className="basket__anchor" aria-label={copy.close} aria-expanded="true" onClick={onClose}>
        <IconBasket size={21} />
      </button>
      <span className="basket__beak" aria-hidden="true" />
      <div ref={panel} className="basket__panel" tabIndex={-1}>
        <BasketPanel openedAt={openedAt} />
      </div>
    </div>,
    document.body,
  )
}
