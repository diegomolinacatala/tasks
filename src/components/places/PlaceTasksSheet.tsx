import { useEffect, useState } from 'react'
import { useAppState } from '../../state/StoreProvider'
import { TaskRow } from '../task/TaskRow'
import { useTaskActions } from '../task/useTaskActions'
import { Sheet } from '../ui/Sheet'
import './places.css'

interface PlaceTasksSheetProps {
  placeId: string | null
  onOpenTask: (taskId: string) => void
  onClose: () => void
}

/** Al tocar el aviso de un lugar con varias tareas: todas juntas para ir marcándolas. */
export function PlaceTasksSheet({ placeId, onOpenTask, onClose }: PlaceTasksSheetProps) {
  const state = useAppState()
  const { toggle } = useTaskActions()
  const [shown, setShown] = useState(placeId)

  useEffect(() => {
    if (placeId) setShown(placeId)
  }, [placeId])

  const place = state.places.find((item) => item.id === shown)
  const tasks = state.tasks.filter((task) =>
    task.reminders.some((reminder) => reminder.kind === 'place' && reminder.placeId === shown),
  )
  // Pendientes primero; lo marcado se queda visible para poder deshacerlo.
  const sorted = [...tasks].sort((a, b) => Number(a.done) - Number(b.done) || a.createdAt - b.createdAt)

  return (
    <Sheet open={placeId !== null} onClose={onClose} title={place?.name ?? 'Lugar'}>
      <p className="sheet__title">{place?.name ?? 'Lugar'}</p>
      <div className="place-tasks">
        {sorted.map((task) => (
          <TaskRow
            key={task.id}
            task={task}
            onToggle={() => toggle(task.id)}
            onOpen={() => {
              onClose()
              onOpenTask(task.id)
            }}
          />
        ))}
      </div>
      {!sorted.length && <p className="sheet__note">No quedan tareas en este lugar.</p>}
    </Sheet>
  )
}
