import { useEffect } from 'react'
import { useCopy } from '../../state/LanguageProvider'
import { IconClose, IconFeather } from '../ui/Icons'

const COPY = {
  es: {
    title: 'Ve a lo que quieras comentar',
    note: 'Puedes cambiar de pestaña o abrir una tarea.',
    mark: 'Señalar',
    leave: 'Salir de las sugerencias',
  },
  en: {
    title: 'Go to what you want to comment on',
    note: 'You can switch tabs or open a task.',
    mark: 'Mark',
    leave: 'Stop suggesting',
  },
} as const

interface FeedbackDockProps {
  onMark: () => void
  onClose: () => void
}

/**
 * Mientras se busca qué comentar: una tarjeta abajo, al alcance del pulgar, que dice qué hacer y tiene
 * un solo botón grande. La barra de escribir se aparta (`data-suggesting`) para no competir con ella.
 */
export function FeedbackDock({ onMark, onClose }: FeedbackDockProps) {
  const copy = useCopy(COPY)

  useEffect(() => {
    const root = document.documentElement
    root.dataset.suggesting = ''
    return () => {
      delete root.dataset.suggesting
    }
  }, [])

  return (
    <div className="fb-dock" role="region" aria-label={copy.title}>
      <div className="fb-dock__text">
        <p className="fb-dock__title">{copy.title}</p>
        <p className="fb-dock__note">{copy.note}</p>
      </div>
      <button type="button" className="fb-dock__mark" onClick={onMark}>
        <IconFeather size={18} />
        <span>{copy.mark}</span>
      </button>
      <button type="button" className="fb-dock__close" aria-label={copy.leave} onClick={onClose}>
        <IconClose size={14} />
      </button>
    </div>
  )
}
