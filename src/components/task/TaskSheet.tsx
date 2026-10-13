import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { shortTime } from '../../lib/date'
import { asOf } from '../../lib/period'
import { useCurrentDay } from '../../hooks/useToday'
import { useCopy } from '../../state/LanguageProvider'
import { useAppState, useDispatch } from '../../state/StoreProvider'
import { findTask } from '../../state/selectors'
import type { IsoDate, Task } from '../../types'
import { ImportanceScale } from '../importance/ImportanceScale'
import { IconCheck, IconChevronRight, IconRepeat, IconTrash } from '../ui/Icons'
import { Sheet } from '../ui/Sheet'
import { useToast } from '../ui/Toast'
import { DurationPicker } from './DurationPicker'
import { ReminderPicker } from './ReminderPicker'
import { SectionField, TimeField, WhenField } from './fields'
import { SnoozeBar } from './SnoozeBar'
import { useTaskActions } from './useTaskActions'

const COPY = {
  es: {
    edit: 'Editar tarea',
    title: 'Título de la tarea',
    complete: 'Completar',
    undone: 'Marcar como pendiente',
    done: (title: string) => `Hecha: ${title}`,
    undo: 'Deshacer',
    importance: 'Importancia',
    normal: 'Normal',
    section: 'Sección',
    noSection: 'Sin sección',
    hiddenTime: (time: string) => `Tiene hora (${time}): vuelve con el día.`,
    actions: 'Acciones',
    toRoutine: 'Convertir en rutina',
    remove: 'Borrar tarea',
  },
  en: {
    edit: 'Edit task',
    title: 'Task title',
    complete: 'Complete',
    undone: 'Mark as pending',
    done: (title: string) => `Done: ${title}`,
    undo: 'Undo',
    importance: 'Importance',
    normal: 'Normal',
    section: 'Section',
    noSection: 'No section',
    hiddenTime: (time: string) => `It has a time (${time}): it comes back with the day.`,
    actions: 'Actions',
    toRoutine: 'Turn into a routine',
    remove: 'Delete task',
  },
} as const

/** Dónde estaba la tarea al abrir el panel: si al cerrar está en otro sitio, se dice adónde (`onRelocated`). */
export interface TaskOrigin {
  date: IsoDate | null
  sectionId: string | null
}

interface TaskSheetProps {
  taskId: string | null
  /** Abierta desde un aviso: se ofrece posponer arriba del todo. */
  fromNotification?: boolean
  onClose: () => void
  /** "Convertir en rutina": lo que se repite no es una tarea. */
  onMakeRoutine: (task: Task) => void
  /** Al cerrar, si Cuándo o la sección cambiaron: la fila puede haberse ido de lo que se está viendo. */
  onRelocated?: (task: Task, from: TaskOrigin) => void
}

export function TaskSheet({ taskId, fromNotification = false, onClose, onMakeRoutine, onRelocated }: TaskSheetProps) {
  const state = useAppState()
  const dispatch = useDispatch()
  const { remove, setImportance, toggle } = useTaskActions()
  const toast = useToast()
  const copy = useCopy(COPY)
  const today = useCurrentDay()
  const task = findTask(state, taskId)
  // Se conserva la última tarea para poder animar el cierre del panel.
  const [shown, setShown] = useState<Task | null>(task)
  const [title, setTitle] = useState(task?.title ?? '')
  // Sección e importancia van plegadas en una fila con su valor: casi nunca se tocan.
  const [sectionOpen, setSectionOpen] = useState(false)
  const [importanceOpen, setImportanceOpen] = useState(false)
  const origin = useRef<TaskOrigin | null>(null)

  useEffect(() => {
    if (!task) return
    setShown(task)
    setTitle(task.title)
    setSectionOpen(false)
    setImportanceOpen(false)
    origin.current = { date: task.date, sectionId: task.sectionId }
  }, [task?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (task) setShown(task)
  }, [task])

  // Un id que ya no existe (la tarea se borró desde otro sitio) no debe quedarse guardado: el panel se
  // abriría solo más tarde con lo primero que se llamara igual.
  useEffect(() => {
    if (taskId && !task) onClose()
  }, [taskId, task, onClose])

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
  const sectionName = shown.sectionId ? state.sections.find((section) => section.id === shown.sectionId)?.name : undefined

  const commitTitle = () => {
    if (task && title.trim() && title !== task.title) {
      dispatch({ type: 'task/rename', id: task.id, title })
    }
  }

  const close = () => {
    commitTitle()
    const from = origin.current
    if (task && from && onRelocated && (task.date !== from.date || task.sectionId !== from.sectionId)) onRelocated(task, from)
    onClose()
  }

  /** El círculo del panel: tacharla la cierra con "Deshacer" en el aviso; destacharla la deja abierta. */
  const complete = () => {
    if (!task) return
    if (task.done) {
      toggle(task.id)
      return
    }
    commitTitle()
    toggle(task.id)
    onClose()
    toast({ message: copy.done(title.trim() || task.title), actionLabel: copy.undo, onAction: () => toggle(task.id) })
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

      <div className="sheet__head">
        <button
          type="button"
          className={`sheet__check ${shown.done ? 'is-done' : ''}`}
          aria-pressed={shown.done}
          aria-label={shown.done ? copy.undone : copy.complete}
          onClick={complete}
        >
          <IconCheck size={14} strokeWidth={2.5} />
        </button>
        <textarea
          ref={titleInput}
          className="sheet__input"
          rows={1}
          value={title}
          // Un título no tiene líneas: Intro suelta el teclado (y lo pegado con saltos se aplana).
          onChange={(event) => setTitle(event.target.value.replace(/\n+/g, ' '))}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault()
              event.currentTarget.blur()
            }
          }}
          onBlur={commitTitle}
          aria-label={copy.title}
          enterKeyHint="done"
        />
      </div>

      <WhenField
        date={shown.date}
        today={today}
        onChange={moveTo}
        until={shown.until}
        onUntil={(until) => task && dispatch({ type: 'task/until', id: task.id, until })}
      />
      {/* Sin fecha la hora no se ve, pero sigue ahí: hay que decirlo para que no sorprenda al darle día. */}
      {shown.date === null && shown.time !== null && <p className="sheet__note">{copy.hiddenTime(shortTime(shown.time))}</p>}

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
      {shown.date !== null &&
        (sectionOpen ? (
          <SectionField sectionId={shown.sectionId} onChange={setSection} />
        ) : (
          <button type="button" className="sheet__row sheet__fold" aria-expanded={false} onClick={() => setSectionOpen(true)}>
            <span className="sheet__fold-label">{copy.section}</span>
            <span className="sheet__fold-value">{sectionName ?? copy.noSection}</span>
            <IconChevronRight size={16} />
          </button>
        ))}

      {importanceOpen ? (
        <>
          <p className="sheet__title">{copy.importance}</p>
          <ImportanceScale value={shown.importance} done={shown.done} onChange={(importance) => task && setImportance(task.id, importance)} />
        </>
      ) : (
        <button type="button" className="sheet__row sheet__fold" aria-expanded={false} onClick={() => setImportanceOpen(true)}>
          <span className="sheet__fold-label">{copy.importance}</span>
          <span className="sheet__fold-value">{shown.importance > 1 ? String(shown.importance) : copy.normal}</span>
          <IconChevronRight size={16} />
        </button>
      )}

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
