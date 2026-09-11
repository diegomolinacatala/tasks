import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { ReactNode } from 'react'
import type { Section } from '../../types'
import { IconChevronDown, IconMore } from '../ui/Icons'
import { columnId, sectionDragId } from '../dnd/ids'
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

export function SectionBlock({ section, taskIds, pending, onToggle, onOpen, children }: SectionBlockProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: sectionDragId(section.id),
    data: { type: 'section' },
  })

  const stop = (event: { stopPropagation: () => void }) => event.stopPropagation()

  return (
    <section
      ref={setNodeRef}
      className={`section ${isDragging ? 'is-dragging' : ''} ${section.collapsed ? 'is-collapsed' : ''}`}
      style={{ transform: CSS.Translate.toString(transform), transition }}
    >
      <header className="section__head" {...attributes} {...listeners}>
        <button
          type="button"
          className="section__chevron"
          aria-expanded={!section.collapsed}
          aria-label={section.collapsed ? `Abrir ${section.name}` : `Cerrar ${section.name}`}
          onPointerDown={stop}
          onClick={onToggle}
        >
          <IconChevronDown size={16} />
        </button>
        <h2 className="section__name">{section.name}</h2>
        {pending > 0 && <span className="section__count">{pending}</span>}
        <button
          type="button"
          className="section__more"
          aria-label={`Opciones de ${section.name}`}
          onPointerDown={stop}
          onClick={onOpen}
        >
          <IconMore size={16} />
        </button>
      </header>

      {!section.collapsed && (
        <TaskColumn columnId={columnId(section.id)} taskIds={taskIds} empty="Suelta una tarea aquí">
          {children}
        </TaskColumn>
      )}
    </section>
  )
}
