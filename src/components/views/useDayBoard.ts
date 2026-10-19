import { useMemo, useRef, useState } from 'react'
import type { DragEndEvent, DragOverEvent, DragStartEvent, Over } from '@dnd-kit/core'
import { arrayMove } from '@dnd-kit/sortable'
import { useAppState, useDispatch } from '../../state/StoreProvider'
import { overdueTasks, sortedSections, untimedGroupsFor } from '../../state/selectors'
import type { IsoDate } from '../../types'
import { OVERDUE, ROOT, columnKeyOf, dayOfDrop, sectionDragId, timelineOfDrop } from '../dnd/ids'
import { buzz } from '../dnd/dnd'

export type Columns = Record<string, string[]>

/** Qué se arrastra: una tarea, una sección o un evento del calendario del iPhone. */
export type DragType = 'task' | 'section' | 'event'

export interface DayDrops {
  /** Soltado sobre un día de la tira o del mes: `id` es el de la tarea o el del evento (`eventDragId`). */
  onDay: (id: string, type: DragType, date: IsoDate) => void
  /** Soltado en el horario, entre dos cosas: quien lo recibe sabe en qué hueco (lo sigue mientras se arrastra). */
  onTimeline: (id: string, type: DragType) => void
}

const findColumn = (columns: Columns, taskId: string) =>
  Object.keys(columns).find((key) => columns[key]?.includes(taskId)) ?? null

const targetColumn = (columns: Columns, over: Over | null) => {
  if (!over) return null
  const id = String(over.id)
  if (dayOfDrop(id) || timelineOfDrop(id)) return null
  return columnKeyOf(id) ?? findColumn(columns, id)
}

const typeOf = (data: { type?: unknown } | undefined): DragType => (data?.type === 'section' || data?.type === 'event' ? data.type : 'task')

/**
 * Tablero de un día de la Agenda: lo atrasado (solo hoy) y lo que no tiene hora, con sus secciones.
 * Durante el arrastre se trabaja sobre una copia (`preview`) y se confirma de una vez al soltar; la
 * copia vive además en un ref, porque al soltar hay que leer el estado real del gesto y no el del
 * último render.
 *
 * De `overdue` se puede sacar pero no recibe nada: sus tareas conservan su fecha hasta que se
 * mueven. Soltar sobre un día de la tira lleva la tarea a ese día y soltar en el horario le pone hora
 * (`drops`): esos dos sitios no tocan el tablero. Un evento del calendario solo va a esos dos sitios.
 */
export function useDayBoard(day: IsoDate, today: IsoDate, drops: DayDrops) {
  const state = useAppState()
  const dispatch = useDispatch()
  const [preview, setPreview] = useState<Columns | null>(null)
  const [active, setActive] = useState<{ id: string; type: DragType } | null>(null)
  const previewRef = useRef<Columns | null>(null)

  const sections = useMemo(() => sortedSections(state), [state])
  const base = useMemo(() => {
    const columns: Columns = day === today ? { [OVERDUE]: overdueTasks(state, today).map((task) => task.id) } : {}
    for (const group of untimedGroupsFor(state, day, today)) {
      columns[group.section?.id ?? ROOT] = group.tasks.map((task) => task.id)
    }
    return columns
  }, [state, day, today])

  const columns = preview ?? base

  const applyPreview = (next: Columns | null) => {
    previewRef.current = next
    setPreview(next)
  }

  const reset = () => {
    applyPreview(null)
    setActive(null)
  }

  const onDragStart = ({ active: dragged }: DragStartEvent) => {
    const type = typeOf(dragged.data.current)
    setActive({ id: String(dragged.id), type })
    if (type === 'task') applyPreview(base)
    buzz()
  }

  const onDragOver = ({ active: dragged, over }: DragOverEvent) => {
    if (typeOf(dragged.data.current) !== 'task' || !over) return
    const taskId = String(dragged.id)
    const from = previewRef.current ?? base
    const source = findColumn(from, taskId)
    const target = targetColumn(from, over)
    if (!source || !target || source === target || target === OVERDUE) return

    const sourceIds = (from[source] ?? []).filter((id) => id !== taskId)
    const targetIds = [...(from[target] ?? [])]
    const overIndex = targetIds.indexOf(String(over.id))
    targetIds.splice(overIndex < 0 ? targetIds.length : overIndex, 0, taskId)

    applyPreview({ ...from, [source]: sourceIds, [target]: targetIds })
  }

  const commitSections = (dragged: string, over: Over | null) => {
    if (!over) return
    const ids = sections.map((section) => sectionDragId(section.id))
    const from = ids.indexOf(dragged)
    const to = ids.indexOf(String(over.id))
    if (from < 0 || to < 0 || from === to) return
    dispatch({ type: 'sections/reorder', ids: arrayMove(sections, from, to).map((section) => section.id) })
  }

  const commitTasks = (taskId: string, over: Over | null) => {
    let next = previewRef.current ?? base
    const column = targetColumn(next, over)
    const source = findColumn(next, taskId)

    if (column && source === column) {
      const ids = next[column] ?? []
      const from = ids.indexOf(taskId)
      const to = columnKeyOf(String(over?.id ?? '')) !== null ? ids.length - 1 : ids.indexOf(String(over?.id))
      if (from >= 0 && to >= 0 && from !== to) next = { ...next, [column]: arrayMove(ids, from, to) }
    }

    dispatch({
      type: 'board/commit',
      columns: Object.entries(next)
        .filter(([key]) => key !== OVERDUE)
        .map(([key, ids]) => ({ date: day, sectionId: key === ROOT ? null : key, ids })),
    })
  }

  const onDragEnd = ({ active: dragged, over }: DragEndEvent) => {
    const id = String(dragged.id)
    const type = typeOf(dragged.data.current)
    const overId = over ? String(over.id) : ''
    const dropDay = dayOfDrop(overId)
    if (type === 'section') commitSections(id, over)
    else if (dropDay) drops.onDay(id, type, dropDay)
    else if (timelineOfDrop(overId)) drops.onTimeline(id, type)
    else if (over && type === 'task') commitTasks(id, over)
    reset()
  }

  return {
    columns,
    // Se mira el tablero confirmado, no la copia: si al arrastrar se saca la única atrasada,
    // el bloque no desaparece a mitad del gesto y la lista no salta bajo el dedo.
    hasOverdue: (base[OVERDUE]?.length ?? 0) > 0,
    sections,
    activeId: active?.id ?? null,
    activeType: active?.type ?? null,
    handlers: { onDragStart, onDragOver, onDragEnd, onDragCancel: reset },
  }
}
