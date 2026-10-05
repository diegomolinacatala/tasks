import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { todayIso } from '../../lib/date'
import { asOf } from '../../lib/period'
import { useCopy } from '../../state/LanguageProvider'
import { useAppState, useDispatch } from '../../state/StoreProvider'
import { findTask } from '../../state/selectors'
import type { IsoDate, Task } from '../../types'
import { ImportanceScale } from '../importance/ImportanceScale'
import { IconRepeat, IconTrash } from '../ui/Icons'
import { Sheet } from '../ui/Sheet'
import { DurationPicker } from './DurationPicker'
import { ReminderPicker } from './ReminderPicker'
import { SectionField, TimeField, WhenField } from './fields'
import { SnoozeBar } from './SnoozeBar'
import { useTaskActions } from './useTaskActions'

const COPY = {
  es: {
    edit: 'Editar tarea',
    title: 'Título de la tarea',
    importance: 'Importancia',
    actions: 'Acciones',
    toRoutine: 'Convertir en rutina',
    remove: 'Borrar tarea',
  },
  en: {
    edit: 'Edit task',
    title: 'Task title',
    importance: 'Importance',
    actions: 'Actions',
    toRoutine: 'Turn into a routine',
    remove: 'Delete task',
  },
} as const

interface TaskSheetProps {
  taskId: string | null
  /** Abierta desde un aviso: se ofrece posponer arriba del todo. */
  fromNotification?: boolean
  onClose: () => void
  /** "Convertir en rutina": lo que se repite no es una tarea. */
  onMakeRoutine: (task: Task) => void
}

export function TaskSheet({ taskId, fromNotification = false, onClose, onMakeRoutine }: TaskSheetProps) {
  const state = useAppState()
  const dispatch = useDispatch()
  const { remove, setImportance } = useTaskActions()
  const copy = useCopy(COPY)
  const task = findTask(state, taskId)
  // Se conserva la última tarea para poder animar el cierre del panel.
  const [shown, setShown] = useState<Task | null>(task)
  const [title, setTitle] = useState(task?.title ?? '')

  useEffect(() => {
    if (!task) return
    setShown(task)
    setTitle(task.title)
  }, [task?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (task) setShown(task)
  }, [task])

  // El título ocupa las líneas que tenga, ni una más: el filete de debajo va pegado al texto.
  const titleInput = useRef<HTMLTextAreaElement>(null)
  useLayoutEffect(() => {
    const input = titleInput.current
    if (!input) return
    input.style.height = 'auto'
    // Con `border-box` la altura incluye el filete, que `scrollHeight` no cuenta.
    input.style.height = `${input.scrollHeight + input.offsetHeight - input.clientHeight}px`
  }, [title, shown?.id])

  if (!shown) return null

  const open = Boolean(task)
  const today = todayIso()

  const commitTitle = () => {
    if (task && title.trim() && title !== task.title) {
      dispatch({ type: 'task/rename', id: task.id, title })
    }
  }

  const close = () => {
    commitTitle()
    onClose()
  }

  const moveTo = (date: IsoDate | null) => {
    if (task) dispatch({ type: 'task/move', id: task.id, date, sectionId: task.sectionId })
  }

  const setSection = (sectionId: string | null) => {
    if (task) dispatch({ type: 'task/move', id: task.id, date: task.date, sectionId })
  }

  const setTime = (time: string | null) => {
    if (task) dispatch({ type: 'task/setTime', id: task.id, time })
  }

  return (
    <Sheet open={open} onClose={close} title={copy.edit}>
      {/* Posponer una tarea ya hecha crearía un aviso que nunca suena. */}
      {fromNotification && !shown.done && <SnoozeBar task={shown} onDone={close} />}

      <textarea
        ref={titleInput}
        className="sheet__input"
        rows={1}
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        onBlur={commitTitle}
        aria-label={copy.title}
      />

      <p className="sheet__title">{copy.importance}</p>
      <ImportanceScale value={shown.importance} onChange={(importance) => task && setImportance(task.id, importance)} />

      <WhenField
        date={shown.date}
        today={today}
        onChange={moveTo}
        until={shown.until}
        onUntil={(until) => task && dispatch({ type: 'task/until', id: task.id, until })}
      />

      {shown.date !== null && <TimeField time={shown.time} onChange={setTime} />}

      {shown.date !== null && shown.time !== null && (
        <DurationPicker
          time={shown.time}
          duration={shown.duration}
          done={shown.done}
          onChange={(duration) => task && dispatch({ type: 'task/setDuration', id: task.id, duration })}
        />
      )}

      <ReminderPicker
        task={asOf(shown, today)}
        onAdd={(reminder) => task && dispatch({ type: 'reminder/add', taskId: task.id, reminder })}
        onRemove={(reminderId) => task && dispatch({ type: 'reminder/remove', taskId: task.id, reminderId })}
      />

      {/* Las secciones agrupan dentro del día: sin fecha no hay dónde agrupar. */}
      {shown.date !== null && <SectionField sectionId={shown.sectionId} onChange={setSection} />}

      <p className="sheet__title">{copy.actions}</p>
      <button
        type="button"
        className="sheet__row"
        onClick={() => {
          if (!task) return
          commitTitle()
          onMakeRoutine({ ...task, title: title.trim() || task.title })
        }}
      >
        <IconRepeat size={18} />
        {copy.toRoutine}
      </button>
      <button
        type="button"
        className="sheet__row sheet__row--danger"
        onClick={() => {
          // Mismo borrado que al deslizar: con "Deshacer" en el aviso.
          if (task) remove(task.id)
          onClose()
        }}
      >
        <IconTrash size={18} />
        {copy.remove}
      </button>
    </Sheet>
  )
}
