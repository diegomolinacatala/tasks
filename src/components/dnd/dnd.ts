import { KeyboardSensor, MouseSensor, TouchSensor, closestCorners, pointerWithin, useSensor, useSensors } from '@dnd-kit/core'
import type { Announcements, CollisionDetection, DragAbortEvent, DragPendingEvent, DraggableSyntheticListeners, UniqueIdentifier } from '@dnd-kit/core'
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable'
import type { KeyboardEventHandler } from 'react'
import { haptic } from '../../lib/platform/feedback'

/**
 * Una tarea (o una sección) se coge **manteniéndola pulsada**, como en Recordatorios o Things: antes
 * había un asa en el borde derecho, justo donde el pulgar de un diestro hace scroll, y se reordenaban
 * listas sin querer. Mientras se mantiene, moverse más que la tolerancia es scroll o deslizar la fila:
 * los tres gestos no compiten. Con el teclado, el botón "Mover" (oculto) de cada fila.
 */
const HOLD_MS = 300
const HOLD_TOLERANCE_PX = 8

export function useDragSensors() {
  return useSensors(
    useSensor(TouchSensor, { activationConstraint: { delay: HOLD_MS, tolerance: HOLD_TOLERANCE_PX } }),
    useSensor(MouseSensor, { activationConstraint: { delay: HOLD_MS, tolerance: HOLD_TOLERANCE_PX } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )
}

/**
 * Los oyentes de una fila, separados: los del dedo y el ratón van en toda la fila (mantener pulsado);
 * el del teclado, en su botón "Mover".
 */
export function splitListeners(listeners: DraggableSyntheticListeners) {
  const { onKeyDown, ...hold } = listeners ?? {}
  const keyboard: { onKeyDown?: KeyboardEventHandler<HTMLElement> } = onKeyDown ? { onKeyDown: onKeyDown as KeyboardEventHandler<HTMLElement> } : {}
  return { hold, keyboard }
}

const PRESSING = 'is-pressing'
const nodeOf = (id: UniqueIdentifier) => document.querySelector(`[data-drag-id="${CSS.escape(String(id))}"]`)

/**
 * Mientras se mantiene pulsada, la fila se hunde un poco (`.is-pressing`): dice que se va a coger.
 * Para `onDragPending` y `onDragAbort` de `DndContext`; `onDragStart` lo quita con `lifted`.
 */
export const pressCue = {
  onDragPending: ({ id }: DragPendingEvent) => nodeOf(id)?.classList.add(PRESSING),
  onDragAbort: ({ id }: DragAbortEvent) => nodeOf(id)?.classList.remove(PRESSING),
}

/** Ya cogida: fuera el hundido. */
export const lifted = () => document.querySelectorAll(`.${PRESSING}`).forEach((node) => node.classList.remove(PRESSING))

/**
 * Una sección solo se suelta entre secciones; una tarea, nunca sobre una sección. Los días (la
 * tira de la semana, el muelle) cuentan solo si el dedo está encima: pasar cerca de ellos al
 * reordenar no debe llevarse la tarea a otro día.
 */
export const scopedCollision: CollisionDetection = (args) => {
  const dragging = args.active.data.current?.type
  const isDay = (type: unknown) => type === 'day'
  if (dragging !== 'section') {
    const days = args.droppableContainers.filter((container) => isDay(container.data.current?.type))
    const [day] = days.length ? pointerWithin({ ...args, droppableContainers: days }) : []
    if (day) return [day]
  }
  const droppableContainers = args.droppableContainers.filter((container) => {
    const type = container.data.current?.type
    if (isDay(type)) return false
    return dragging === 'section' ? type === 'section' : type !== 'section'
  })
  return closestCorners({ ...args, droppableContainers })
}

export const announcements: Announcements = {
  onDragStart: () => 'Elemento cogido.',
  onDragOver: () => undefined,
  onDragEnd: () => 'Elemento soltado.',
  onDragCancel: () => 'Movimiento cancelado.',
}

/** Al cogerla, un toque háptico (en el iPhone; en la web, la vibración si la hay). */
export const buzz = () => {
  lifted()
  haptic('tap')
  navigator.vibrate?.(10)
}
