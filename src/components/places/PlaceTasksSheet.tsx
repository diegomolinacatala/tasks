import { useEffect, useState } from 'react'
import { plural } from '../../lib/i18n'
import { pendingCount } from '../../lib/shopping'
import { useCopy } from '../../state/LanguageProvider'
import { useAppState } from '../../state/StoreProvider'
import { TaskRow } from '../task/TaskRow'
import { useTaskActions } from '../task/useTaskActions'
import { IconBasket, IconChevronRight } from '../ui/Icons'
import { Sheet } from '../ui/Sheet'
import './places.css'

const COPY = {
  es: {
    place: 'Lugar',
    pending: (count: number) => `${plural(count, 'pendiente', 'pendientes')} aquí`,
    empty: 'No quedan tareas en este lugar.',
    basket: (count: number) => `Cesta · ${count}`,
  },
  en: {
    place: 'Place',
    pending: (count: number) => `${plural(count, 'pending', 'pending')} here`,
    empty: 'No tasks left at this place.',
    basket: (count: number) => `Basket · ${count}`,
  },
} as const

interface PlaceTasksSheetProps {
  placeId: string | null
  onOpenTask: (taskId: string) => void
  /** La cesta avisa en este lugar: una fila la abre. */
  onOpenBasket?: () => void
  onClose: () => void
}

/** Al tocar el aviso de un lugar con varias tareas: todas juntas para ir marcándolas (y la cesta, si avisa aquí). */
export function PlaceTasksSheet({ placeId, onOpenTask, onOpenBasket, onClose }: PlaceTasksSheetProps) {
  const state = useAppState()
  const { toggle } = useTaskActions()
  const copy = useCopy(COPY)
  const [shown, setShown] = useState(placeId)
  const basket = state.shopping.placeId === shown ? pendingCount(state.shopping.items) : 0

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
    <Sheet open={placeId !== null} onClose={onClose} title={place?.name ?? copy.place}>
      {basket > 0 && onOpenBasket && (
        <button
          type="button"
          className="sheet__row"
          onClick={() => {
            onClose()
            onOpenBasket()
          }}
        >
          <IconBasket size={18} />
          <span className="sheet__fold-label">{copy.basket(basket)}</span>
          <IconChevronRight size={16} />
        </button>
      )}
      {/* El nombre ya es el título del panel: aquí, cuántas quedan. */}
      {sorted.length > 0 && <p className="sheet__title">{copy.pending(sorted.filter((task) => !task.done).length)}</p>}
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
      {!sorted.length && !basket && <p className="sheet__note">{copy.empty}</p>}
    </Sheet>
  )
}
