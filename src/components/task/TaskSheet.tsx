import { useEffect, useState } from 'react'
import { addDays, relativeLabel, shortTime, todayIso } from '../../lib/date'
import { createId } from '../../lib/id'
import { useAppState, useDispatch } from '../../state/StoreProvider'
import { findTask, sortedSections } from '../../state/selectors'
import type { IsoDate, Task } from '../../types'
import { ImportanceScale } from '../importance/ImportanceScale'
import { IconTrash } from '../ui/Icons'
import { Sheet } from '../ui/Sheet'
import { DurationPicker } from './DurationPicker'
import { ReminderPicker } from './ReminderPicker'
import { SnoozeBar } from './SnoozeBar'
import { useTaskActions } from './useTaskActions'

interface TaskSheetProps {
  taskId: string | null
  /** Abierta desde un aviso: se ofrece posponer arriba del todo. */
  fromNotification?: boolean
  onClose: () => void
}

export function TaskSheet({ taskId, fromNotification = false, onClose }: TaskSheetProps) {
  const state = useAppState()
  const dispatch = useDispatch()
  const { remove, setImportance } = useTaskActions()
  const task = findTask(state, taskId)
  // Se conserva la última tarea para poder animar el cierre del panel.
  const [shown, setShown] = useState<Task | null>(task)
  const [title, setTitle] = useState(task?.title ?? '')
  const [draftSection, setDraftSection] = useState<string | null>(null)

  useEffect(() => {
    if (!task) return
    setShown(task)
    setTitle(task.title)
    setDraftSection(null)
  }, [task?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (task) setShown(task)
  }, [task])

  if (!shown) return null

  const open = Boolean(task)
  const today = todayIso()
  const sections = sortedSections(state)
  const tomorrow = addDays(today, 1)
  const isCustomDate = Boolean(shown.date && shown.date !== today && shown.date !== tomorrow)

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

  const createSection = (name: string) => {
    if (!task || !name.trim()) return
    const id = createId()
    dispatch({ type: 'section/add', name, id })
    dispatch({ type: 'task/move', id: task.id, date: task.date, sectionId: id })
    setDraftSection(null)
  }

  const setTime = (time: string | null) => {
    if (task) dispatch({ type: 'task/setTime', id: task.id, time })
  }

  return (
    <Sheet open={open} onClose={close} title="Editar tarea">
      {/* Posponer una tarea ya hecha crearía un aviso que nunca suena. */}
      {fromNotification && !shown.done && <SnoozeBar task={shown} onDone={close} />}

      <textarea
        className="sheet__input"
        rows={2}
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        onBlur={commitTitle}
        aria-label="Título de la tarea"
      />

      <p className="sheet__title">Importancia</p>
      <ImportanceScale value={shown.importance} onChange={(importance) => task && setImportance(task.id, importance)} />

      <p className="sheet__title">Cuándo</p>
      <div className="sheet__chips">
        <button type="button" className={`chip ${shown.date === today ? 'is-active' : ''}`} onClick={() => moveTo(today)}>
          Hoy
        </button>
        <button
          type="button"
          className={`chip ${shown.date === tomorrow ? 'is-active' : ''}`}
          onClick={() => moveTo(tomorrow)}
        >
          Mañana
        </button>
        <button type="button" className={`chip ${shown.date === null ? 'is-active' : ''}`} onClick={() => moveTo(null)}>
          Sin fecha
        </button>
        <label className={`chip ${isCustomDate ? 'is-active' : ''}`}>
          {isCustomDate && shown.date ? relativeLabel(shown.date, today) : 'Otro día'}
          <input
            type="date"
            className="sr-only"
            value={shown.date ?? ''}
            onChange={(event) => moveTo(event.target.value || null)}
          />
        </label>
      </div>

      {shown.date !== null && (
        <>
          <p className="sheet__title">Hora</p>
          <div className="sheet__chips">
            <button type="button" className={`chip ${shown.time === null ? 'is-active' : ''}`} onClick={() => setTime(null)}>
              Sin hora
            </button>
            <label className={`chip ${shown.time ? 'is-active' : ''}`}>
              {shown.time ? shortTime(shown.time) : 'Elegir hora'}
              <input
                type="time"
                className="sr-only"
                value={shown.time ?? ''}
                onChange={(event) => setTime(event.target.value || null)}
              />
            </label>
          </div>
        </>
      )}

      {shown.date !== null && shown.time !== null && <DurationPicker task={{ ...shown, time: shown.time }} />}

      <ReminderPicker task={shown} />

      {/* Las secciones agrupan dentro del día: sin fecha no hay dónde agrupar. */}
      {shown.date !== null && (
        <>
          <p className="sheet__title">Sección</p>
          <div className="sheet__chips">
            <button
              type="button"
              className={`chip ${shown.sectionId === null ? 'is-active' : ''}`}
              onClick={() => setSection(null)}
            >
              Ninguna
            </button>
            {sections.map((section) => (
              <button
                key={section.id}
                type="button"
                className={`chip ${shown.sectionId === section.id ? 'is-active' : ''}`}
                onClick={() => setSection(section.id)}
              >
                {section.name}
              </button>
            ))}
            {draftSection === null ? (
              <button type="button" className="chip" onClick={() => setDraftSection('')}>
                + Nueva
              </button>
            ) : (
              <input
                className="chip"
                autoFocus
                placeholder="Nombre"
                value={draftSection}
                onChange={(event) => setDraftSection(event.target.value)}
                onBlur={() => setDraftSection(null)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') createSection(draftSection)
                  if (event.key === 'Escape') setDraftSection(null)
                }}
              />
            )}
          </div>
        </>
      )}

      <p className="sheet__title">Acciones</p>
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
        Borrar tarea
      </button>
    </Sheet>
  )
}
