import { useMemo, useState } from 'react'
import { DndContext, DragOverlay } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { dayNameLong, dayNumber, monthShort, relativeLabel } from '../../lib/date'
import { useAppState, useDispatch } from '../../state/StoreProvider'
import { progressOf, tasksOn } from '../../state/selectors'
import type { IsoDate, Task } from '../../types'
import { announcements, scopedCollision, useDragSensors } from '../dnd/dnd'
import { BACKLOG, OVERDUE, ROOT, columnId, sectionDragId } from '../dnd/ids'
import { BlockHeader } from '../section/BlockHeader'
import { SectionBlock } from '../section/SectionBlock'
import { TaskColumn } from '../section/TaskColumn'
import { SortableTask } from '../task/SortableTask'
import { TaskRow } from '../task/TaskRow'
import { useTaskActions } from '../task/useTaskActions'
import { IconPlus } from '../ui/Icons'
import { useHomeBoard } from './useHomeBoard'
import './views.css'

interface HomeViewProps {
  today: IsoDate
  onOpenTask: (id: string) => void
  onOpenSection: (id: string) => void
}

export function HomeView({ today, onOpenTask, onOpenSection }: HomeViewProps) {
  const state = useAppState()
  const dispatch = useDispatch()
  const sensors = useDragSensors()
  const { toggle, remove } = useTaskActions()
  const { columns, sections, activeId, activeType, handlers } = useHomeBoard(today)
  const [draftSection, setDraftSection] = useState<string | null>(null)

  const byId = useMemo(() => new Map(state.tasks.map((task) => [task.id, task])), [state.tasks])
  const progress = progressOf(tasksOn(state, today))

  const overdueIds = columns[OVERDUE] ?? []
  const rootIds = columns[ROOT] ?? []
  const backlogIds = columns[BACKLOG] ?? []
  const pending = (ids: string[]) => ids.filter((id) => !byId.get(id)?.done).length

  const renderTask = (
    id: string,
    sectionId: string | null,
    options: { overdue?: boolean; meta?: string | null } = {},
  ) => {
    const task = byId.get(id)
    if (!task) return null
    return (
      <SortableTask
        key={id}
        task={task}
        sectionId={sectionId}
        overdue={options.overdue}
        meta={options.meta}
        dropDisabled={options.overdue}
        onToggle={() => toggle(id)}
        onOpen={() => onOpenTask(id)}
        onDelete={() => remove(id)}
      />
    )
  }

  const dragged: Task | null = activeType === 'task' && activeId ? (byId.get(activeId) ?? null) : null
  const draggedSection = activeType === 'section' && activeId ? activeId.slice(4) : null

  const addSection = (name: string) => {
    if (name.trim()) dispatch({ type: 'section/add', name })
    setDraftSection(null)
  }

  return (
    <div className="view">
      <header className="view__head">
        <p className="view__kicker">{dayNameLong(today)}</p>
        <div className="view__headline">
          <h1 className="view__title">
            {dayNumber(today)} <span className="view__title-dim">{monthShort(today)}</span>
          </h1>
          {progress.total > 0 && (
            <p className="view__stat">
              {progress.done}/{progress.total}
            </p>
          )}
        </div>
        <div className="view__progress" aria-hidden="true">
          <span style={{ transform: `scaleX(${progress.ratio})` }} />
        </div>
      </header>

      <DndContext
        sensors={sensors}
        collisionDetection={scopedCollision}
        accessibility={{ announcements }}
        {...handlers}
      >
        {overdueIds.length > 0 && (
          <section className="block">
            <BlockHeader
              label="Atrasadas"
              count={overdueIds.length}
              tone="danger"
              collapsed={state.collapsed.overdue}
              onToggle={() => dispatch({ type: 'block/toggle', block: 'overdue' })}
            />
            {!state.collapsed.overdue && (
              <TaskColumn columnId={columnId(OVERDUE)} taskIds={overdueIds} droppable={false}>
                {overdueIds.map((id) => {
                  const date = byId.get(id)?.date
                  return renderTask(id, null, {
                    overdue: true,
                    meta: date ? relativeLabel(date, today) : null,
                  })
                })}
              </TaskColumn>
            )}
          </section>
        )}

        <section className="block">
          <BlockHeader label="Hoy" count={pending(rootIds)} />
          <TaskColumn columnId={columnId(ROOT)} taskIds={rootIds} empty="Nada para hoy.">
            {rootIds.map((id) => renderTask(id, null))}
          </TaskColumn>

          <SortableContext
            items={sections.map((section) => sectionDragId(section.id))}
            strategy={verticalListSortingStrategy}
          >
            {sections.map((section) => {
              const ids = columns[section.id] ?? []
              return (
                <SectionBlock
                  key={section.id}
                  section={section}
                  taskIds={ids}
                  pending={pending(ids)}
                  onToggle={() => dispatch({ type: 'section/toggle', id: section.id })}
                  onOpen={() => onOpenSection(section.id)}
                >
                  {ids.map((id) => renderTask(id, section.id))}
                </SectionBlock>
              )
            })}
          </SortableContext>

          {draftSection === null ? (
            <button type="button" className="view__add-section" onClick={() => setDraftSection('')}>
              <IconPlus size={14} />
              Sección
            </button>
          ) : (
            <input
              className="view__section-input"
              autoFocus
              placeholder="Nombre de la sección"
              value={draftSection}
              onChange={(event) => setDraftSection(event.target.value)}
              onBlur={() => addSection(draftSection)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') addSection(draftSection)
                if (event.key === 'Escape') setDraftSection(null)
              }}
            />
          )}
        </section>

        <section className="block">
          <BlockHeader
            label="Sin fecha"
            count={pending(backlogIds)}
            collapsed={state.collapsed.backlog}
            onToggle={() => dispatch({ type: 'block/toggle', block: 'backlog' })}
          />
          {!state.collapsed.backlog && (
            <TaskColumn
              columnId={columnId(BACKLOG)}
              taskIds={backlogIds}
              empty="Lo que añades sin fecha cae aquí."
            >
              {backlogIds.map((id) => renderTask(id, null))}
            </TaskColumn>
          )}
        </section>

        <DragOverlay dropAnimation={{ duration: 180, easing: 'cubic-bezier(0.2,0.8,0.2,1)' }}>
          {dragged && (
            <div className="task-overlay">
              <TaskRow task={dragged} />
            </div>
          )}
          {draggedSection && (
            <div className="section-overlay">
              <p className="section__name">{sections.find((s) => s.id === draggedSection)?.name}</p>
            </div>
          )}
        </DragOverlay>
      </DndContext>
    </div>
  )
}
