import {
  KeyboardSensor,
  PointerSensor,
  closestCorners,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import type { Announcements, CollisionDetection } from '@dnd-kit/core'
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable'

/** Pulsación mantenida: deja libres el scroll vertical y el swipe horizontal. */
const HOLD_MS = 200
const HOLD_TOLERANCE_PX = 6

export function useDragSensors() {
  return useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { delay: HOLD_MS, tolerance: HOLD_TOLERANCE_PX },
    }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )
}

/** Una sección solo puede soltarse entre secciones; una tarea, nunca sobre una sección. */
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
