import type { CSSProperties } from 'react'
import { timeRange } from '../../lib/duration'
import { importanceScale } from '../../lib/importance'
import { nextReminderAt } from '../../lib/reminders'
import { useCopy } from '../../state/LanguageProvider'
import type { Task } from '../../types'
import { IconBell, IconCheck, IconPin } from '../ui/Icons'

const COPY = {
  es: {
    undone: (title: string) => `Marcar «${title}» como pendiente`,
    complete: (title: string) => `Completar «${title}»`,
  },
  en: {
    undone: (title: string) => `Mark “${title}” as pending`,
    complete: (title: string) => `Complete “${title}”`,
  },
} as const

interface TaskRowProps {
  task: Task
  meta?: string | null
  overdue?: boolean
  /** Importancia que se está eligiendo con el mando; si no, la de la tarea. */
  importance?: number
  onToggle?: () => void
  onOpen?: () => void
}

export function TaskRow({ task, meta, overdue = false, importance, onToggle, onOpen }: TaskRowProps) {
  const copy = useCopy(COPY)
  // Con duración, el tramo entero: `17:30–18:30`.
  const text = [meta, timeRange(task)].filter(Boolean).join(' · ')
  const reminding = nextReminderAt(task, Date.now()) !== null
  const placed = !task.done && task.reminders.some((reminder) => reminder.kind === 'place')
  // Lo hecho ya no pide atención: vuelve al tamaño normal (la importancia se conserva).
  const scale = task.done ? 0 : importanceScale(importance ?? task.importance)

  return (
    <div
      className={`row ${task.done ? 'is-done' : ''} ${overdue ? 'is-overdue' : ''}`}
      style={scale ? ({ '--imp': scale } as CSSProperties) : undefined}
    >
      <button
        type="button"
        className="row__check"
        aria-pressed={task.done}
        aria-label={task.done ? copy.undone(task.title) : copy.complete(task.title)}
        onPointerDown={(event) => event.stopPropagation()}
        onClick={onToggle}
      >
        <IconCheck size={13} strokeWidth={2.5} />
      </button>
      <button type="button" className="row__main" onClick={onOpen}>
        <span className="row__title">
          <span className="row__text">{task.title}</span>
        </span>
        {(text || reminding || placed) && (
          <span className="row__meta">
            {reminding && <IconBell size={11} strokeWidth={2} />}
            {placed && <IconPin size={11} strokeWidth={2} />}
            {text}
          </span>
        )}
      </button>
    </div>
  )
}
