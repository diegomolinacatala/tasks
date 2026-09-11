import { useMemo, useRef, useState } from 'react'
import type { DragEndEvent, DragOverEvent, DragStartEvent, Over } from '@dnd-kit/core'
import { arrayMove } from '@dnd-kit/sortable'
import { useAppState, useDispatch } from '../../state/StoreProvider'
import { groupsFor, sortedSections } from '../../state/selectors'
import type { IsoDate } from '../../types'
import { ROOT, columnKeyOf, sectionDragId, sectionIdOf } from '../dnd/ids'

export type Columns = Record<string, string[]>

const findColumn = (columns: Columns, taskId: string) =>
  Object.keys(columns).find((key) => columns[key]?.includes(taskId)) ?? null

const targetColumn = (columns: Columns, over: Over | null) => {
  if (!over) return null
  const id = String(over.id)
  return columnKeyOf(id) ?? findColumn(columns, id)
}

/**
 * Tablero de la vista Hoy: secciones reordenables y tareas que saltan entre ellas.
 * Durante el arrastre se trabaja sobre una copia (`preview`) y se confirma de una vez al soltar.
 * La copia vive también en un ref porque al soltar hay que leer el estado real del gesto,
 * no el del último render.
 */
export function useTodayBoard(date: IsoDate) {
  const state = useAppState()
  const dispatch = useDispatch()
  const [preview, setPreview] = useState<Columns | null>(null)
  const [active, setActive] = useState<{ id: string; type: string } | null>(null)
  const previewRef = useRef<Columns | null>(null)

  const sections = useMemo(() => sortedSections(state), [state])
  const base = useMemo(() => {
    const columns: Columns = {}
    for (const group of groupsFor(state, date)) {
      columns[group.section?.id ?? ROOT] = group.tasks.map((task) => task.id)
    }
    return columns
  }, [state, date])

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
    const type = String(dragged.data.current?.type ?? 'task')
    setActive({ id: String(dragged.id), type })
    if (type === 'task') applyPreview(base)
  }

  const onDragOver = ({ active: dragged, over }: DragOverEvent) => {
    if (dragged.data.current?.type !== 'task' || !over) return
    const taskId = String(dragged.id)
    const from = previewRef.current ?? base
    const source = findColumn(from, taskId)
    const target = targetColumn(from, over)
    if (!source || !target || source === target) return

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
      date,
      columns: Object.entries(next).map(([key, ids]) => ({
        sectionId: key === ROOT ? null : key,
        ids,
      })),
    })
  }

  const onDragEnd = ({ active: dragged, over }: DragEndEvent) => {
    const id = String(dragged.id)
    if (sectionIdOf(id)) commitSections(id, over)
    else if (over) commitTasks(id, over)
    reset()
  }

  return {
    columns,
    sections,
    activeId: active?.id ?? null,
    activeType: active?.type ?? null,
    handlers: { onDragStart, onDragOver, onDragEnd, onDragCancel: reset },
  }
}
