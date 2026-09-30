import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { addDays, shortTime, startOfWeek } from '../../lib/date'
import { createId } from '../../lib/id'
import { haptic } from '../../lib/platform/feedback'
import {
  ALL_DAYS,
  DAY_LETTERS,
  WEEKEND,
  WORKDAYS,
  bestStreak,
  cleanDays,
  completionRate,
  createdOn,
  isDue,
  streak,
} from '../../lib/routines'
import { useAppState, useDispatch } from '../../state/StoreProvider'
import type { IsoDate, IsoTime, Routine } from '../../types'
import { useTaskActions } from '../task/useTaskActions'
import { IconTrash } from '../ui/Icons'
import { PickerChip } from '../ui/PickerChip'
import { Sheet } from '../ui/Sheet'
import './routines.css'

interface RoutineSheetProps {
  /** `''` = rutina nueva; `null` = cerrado. */
  routineId: string | null
  today: IsoDate
  onClose: () => void
}

interface Draft {
  title: string
  days: number[]
  time: IsoTime | null
}

const PRESETS: { label: string; days: readonly number[] }[] = [
  { label: 'Cada día', days: ALL_DAYS },
  { label: 'Entre semana', days: WORKDAYS },
  { label: 'Fines de semana', days: WEEKEND },
]

const HISTORY_WEEKS = 5

const same = (a: readonly number[], b: readonly number[]) => a.length === b.length && a.every((day, index) => day === b[index])

/**
 * Crear o editar una rutina: nombre, qué días toca y a qué hora avisa. Una existente enseña además
 * su racha, la mejor y lo cumplido en el último mes, y las últimas cinco semanas día a día. Los
 * cambios de una existente se aplican al momento; una nueva se crea al cerrar si tiene nombre.
 */
export function RoutineSheet({ routineId, today, onClose }: RoutineSheetProps) {
  const state = useAppState()
  const dispatch = useDispatch()
  const { removeRoutine } = useTaskActions()
  // Se conserva la última para animar el cierre sin que cambie el contenido.
  const [shownId, setShownId] = useState<string | null>(routineId)
  const routine = shownId ? (state.routines.find((item) => item.id === shownId) ?? null) : null
  const [draft, setDraft] = useState<Draft>({ title: '', days: [...ALL_DAYS], time: null })
  const titleInput = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (routineId === null) return
    setShownId(routineId)
    const current = routineId ? state.routines.find((item) => item.id === routineId) : undefined
    setDraft(current ? { title: current.title, days: current.days, time: current.time } : { title: '', days: [...ALL_DAYS], time: null })
  }, [routineId]) // eslint-disable-line react-hooks/exhaustive-deps

  useLayoutEffect(() => {
    const input = titleInput.current
    if (!input) return
    input.style.height = 'auto'
    input.style.height = `${input.scrollHeight + input.offsetHeight - input.clientHeight}px`
  }, [draft.title, shownId])

  const update = (patch: Partial<Draft>) => {
    const next = { ...draft, ...patch }
    setDraft(next)
    // Una existente cambia al momento (menos el nombre, que se guarda al salir del campo).
    if (routine && (patch.days !== undefined || patch.time !== undefined)) {
      dispatch({ type: 'routine/update', id: routine.id, days: next.days, time: next.time })
    }
  }

  const toggleDay = (day: number) => {
    const has = draft.days.includes(day)
    // Siempre toca algún día: el último no se puede quitar.
    if (has && draft.days.length === 1) return
    haptic('selection')
    update({ days: cleanDays(has ? draft.days.filter((item) => item !== day) : [...draft.days, day]) })
  }

  const commitTitle = () => {
    if (routine && draft.title.trim() && draft.title !== routine.title) dispatch({ type: 'routine/update', id: routine.id, title: draft.title })
  }

  const close = () => {
    commitTitle()
    if (routineId === '' && draft.title.trim()) {
      dispatch({ type: 'routine/add', id: createId(), title: draft.title, days: draft.days, time: draft.time })
      haptic('success')
    }
    onClose()
  }

  const isNew = shownId === ''

  return (
    <Sheet open={routineId !== null} onClose={close} title={isNew ? 'Nueva rutina' : 'Rutina'}>
      <textarea
        ref={titleInput}
        className="sheet__input"
        rows={1}
        value={draft.title}
        placeholder={isNew ? 'Tomar creatina' : undefined}
        autoFocus={isNew}
        aria-label="Nombre de la rutina"
        onChange={(event) => setDraft({ ...draft, title: event.target.value.replace(/\n/g, ' ') })}
        onBlur={commitTitle}
      />

      <p className="sheet__title">Días</p>
      <div className="days-picker" role="group" aria-label="Días de la semana">
        {DAY_LETTERS.map((letter, index) => {
          const day = index + 1
          const active = draft.days.includes(day)
          return (
            <button
              key={letter}
              type="button"
              className={`days-picker__day ${active ? 'is-active' : ''}`}
              aria-pressed={active}
              onClick={() => toggleDay(day)}
            >
              {letter}
            </button>
          )
        })}
      </div>
      <div className="sheet__chips">
        {PRESETS.map((preset) => (
          <button
            key={preset.label}
            type="button"
            className={`chip ${same(draft.days, preset.days) ? 'is-active' : ''}`}
            onClick={() => update({ days: [...preset.days] })}
          >
            {preset.label}
          </button>
        ))}
      </div>

      <p className="sheet__title">Aviso</p>
      <div className="sheet__chips">
        <button type="button" className={`chip ${draft.time === null ? 'is-active' : ''}`} onClick={() => update({ time: null })}>
          Sin aviso
        </button>
        <PickerChip
          type="time"
          className={`chip ${draft.time ? 'is-active' : ''}`}
          value={draft.time ?? ''}
          onCommit={(value) => update({ time: value || null })}
        >
          {draft.time ? `A las ${shortTime(draft.time)}` : 'A una hora'}
        </PickerChip>
      </div>

      {routine && <RoutineHistory routine={routine} today={today} />}

      {routine && (
        <>
          <p className="sheet__title">Acciones</p>
          <button
            type="button"
            className="sheet__row sheet__row--danger"
            onClick={() => {
              removeRoutine(routine.id)
              onClose()
            }}
          >
            <IconTrash size={18} />
            Borrar rutina
          </button>
        </>
      )}

      {isNew && (
        <button type="button" className="sheet__primary" disabled={!draft.title.trim()} onClick={close}>
          Añadir rutina
        </button>
      )}
    </Sheet>
  )
}

function RoutineHistory({ routine, today }: { routine: Routine; today: IsoDate }) {
  const current = streak(routine, today)
  const best = bestStreak(routine, today)
  const rate = completionRate(routine, today)
  const first = addDays(startOfWeek(today), -7 * (HISTORY_WEEKS - 1))
  const days = Array.from({ length: HISTORY_WEEKS * 7 }, (_, index) => addDays(first, index))
  const done = new Set(routine.done)
  const born = createdOn(routine)
  // Antes de crearla no tocaba (salvo lo que ya aparezca hecho).
  const due = (day: IsoDate) => done.has(day) || (day >= born && isDue(routine, day))

  return (
    <>
      <p className="sheet__title">Constancia</p>
      <div className="routine-stats">
        <div className="routine-stats__item">
          <span className="routine-stats__value">{current}</span>
          <span className="routine-stats__label">Racha</span>
        </div>
        <div className="routine-stats__item">
          <span className="routine-stats__value">{best}</span>
          <span className="routine-stats__label">Mejor</span>
        </div>
        <div className="routine-stats__item">
          <span className="routine-stats__value">{rate === null ? '—' : `${Math.round(rate * 100)}%`}</span>
          <span className="routine-stats__label">30 días</span>
        </div>
      </div>
      <div className="routine-history" aria-hidden="true">
        {DAY_LETTERS.map((letter) => (
          <span key={letter} className="routine-history__head">
            {letter}
          </span>
        ))}
        {days.map((day) => (
          <i
            key={day}
            className={`routine-history__cell ${done.has(day) ? 'is-done' : ''} ${due(day) ? '' : 'is-free'} ${
              day > today ? 'is-future' : ''
            } ${day === today ? 'is-today' : ''}`}
          />
        ))}
      </div>
    </>
  )
}
