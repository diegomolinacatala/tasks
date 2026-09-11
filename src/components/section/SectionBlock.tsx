import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { ReactNode } from 'react'
import type { Section } from '../../types'
import { columnId, sectionDragId } from '../dnd/ids'
import { IconChevronDown, IconGrip, IconMore } from '../ui/Icons'
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

  return (
    <section
      ref={setNodeRef}
      className={`section ${isDragging ? 'is-dragging' : ''} ${section.collapsed ? 'is-collapsed' : ''}`}
      style={{ transform: CSS.Translate.toString(transform), transition }}
    >
      <header className="section__head">
        <button
          type="button"
          className="section__toggle"
          aria-expanded={!section.collapsed}
          onClick={onToggle}
        >
          <span className="section__chevron" aria-hidden="true">
            <IconChevronDown size={16} />
          </span>
          <span className="section__name">{section.name}</span>
          {pending > 0 && <span className="section__count">{pending}</span>}
        </button>

        <button type="button" className="section__icon" aria-label={`Opciones de ${section.name}`} onClick={onOpen}>
          <IconMore size={16} />
        </button>
        <button
          type="button"
          className="section__icon section__grip"
          aria-label={`Mover sección ${section.name}`}
          {...attributes}
          {...listeners}
        >
          <IconGrip size={16} />
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
