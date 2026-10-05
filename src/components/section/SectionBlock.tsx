import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useEffect, useRef } from 'react'
import type { MouseEvent as ReactMouseEvent, ReactNode } from 'react'
import { useCopy } from '../../state/LanguageProvider'
import type { Section } from '../../types'
import { columnId, sectionDragId } from '../dnd/ids'
import { IconChevronDown, IconMore } from '../ui/Icons'
import { splitListeners } from '../dnd/dnd'
import { TaskColumn } from './TaskColumn'
import './section.css'

interface SectionBlockProps {
  section: Section
  taskIds: string[]
  pending: number
  onToggle: () => void
  onOpen: () => void
  children: ReactNode
}

const COPY = {
  es: { options: (name: string) => `Opciones de ${name}`, move: (name: string) => `Mover sección ${name}` },
  en: { options: (name: string) => `${name} options`, move: (name: string) => `Move section ${name}` },
} as const

/**
 * Una sección del día: su cabecera la pliega al tocarla y, mantenida pulsada, la coge para cambiarla de
 * sitio (como las tareas: sin asa). Con el teclado, su botón "Mover", que no se ve.
 */
export function SectionBlock({ section, taskIds, pending, onToggle, onOpen, children }: SectionBlockProps) {
  const copy = useCopy(COPY)
  const id = sectionDragId(section.id)
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id, data: { type: 'section' } })
  const { hold, keyboard } = splitListeners(listeners)
  // Soltarla sin moverse no debe plegarla.
  const dragged = useRef(false)
  useEffect(() => {
    if (isDragging) {
      dragged.current = true
      return
    }
    const timer = window.setTimeout(() => (dragged.current = false), 450)
    return () => window.clearTimeout(timer)
  }, [isDragging])
  const swallowClick = (event: ReactMouseEvent) => {
    if (!dragged.current) return
    dragged.current = false
    event.preventDefault()
    event.stopPropagation()
  }

  return (
    <section
      ref={setNodeRef}
      className={`section ${isDragging ? 'is-dragging' : ''} ${section.collapsed ? 'is-collapsed' : ''}`}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      data-drag-id={id}
    >
      <header className="section__head" {...hold} onClickCapture={swallowClick} onContextMenu={(event) => event.preventDefault()}>
        <button
          type="button"
          className="section__toggle"
          aria-expanded={!section.collapsed}
          onClick={onToggle}
        >
          <span className="section__name">{section.name}</span>
          {pending > 0 && <span className="section__count">{pending}</span>}
          <span className="section__chevron" aria-hidden="true">
            <IconChevronDown size={14} />
          </span>
        </button>

        <button type="button" className="section__icon" aria-label={copy.options(section.name)} onClick={onOpen}>
          <IconMore size={16} />
        </button>
        <button type="button" className="sr-only" aria-label={copy.move(section.name)} {...attributes} {...keyboard} />
      </header>

      {!section.collapsed && (
        <TaskColumn columnId={columnId(section.id)} taskIds={taskIds} empty="Suelta una tarea aquí">
          {children}
        </TaskColumn>
      )}
    </section>
  )
}
