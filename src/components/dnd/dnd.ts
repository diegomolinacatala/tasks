import { KeyboardSensor, PointerSensor, closestCorners, useSensor, useSensors } from '@dnd-kit/core'
import type { Announcements, CollisionDetection } from '@dnd-kit/core'
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable'

/**
 * El arrastre solo se activa desde el asa, así que no compite con el scroll ni con
 * el deslizamiento: basta un umbral corto de movimiento.
 */
const START_DISTANCE_PX = 4

export function useDragSensors() {
  return useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: START_DISTANCE_PX } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )
}

/** Una sección solo se suelta entre secciones; una tarea, nunca sobre una sección. */
export const scopedCollision: CollisionDetection = (args) => {
  const dragging = args.active.data.current?.type
  const droppableContainers = args.droppableContainers.filter((container) => {
    const type = container.data.current?.type
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

export const buzz = () => navigator.vibrate?.(10)
