import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { shortTime } from '../../lib/date'
import { suggestEmoji } from '../../lib/emoji'
import { createId } from '../../lib/id'
import { haptic } from '../../lib/platform/feedback'
import { ALL_DAYS, WEEKEND, WORKDAYS, cleanDays, dayLetters, daysLabel, weeklyPreset } from '../../lib/routines'
import { useCopy } from '../../state/LanguageProvider'
import { useAppState, useDispatch } from '../../state/StoreProvider'
import type { IsoDate, IsoTime } from '../../types'
import { useTaskActions } from '../task/useTaskActions'
import { IconSmile, IconTrash } from '../ui/Icons'
import { PickerChip } from '../ui/PickerChip'
import { Sheet } from '../ui/Sheet'
import { EmojiPicker } from './EmojiPicker'
import { RoutineLog } from './RoutineLog'
import './routines.css'

interface RoutineSheetProps {
  /** `''` = rutina nueva; `null` = cerrado. */
  routineId: string | null
  today: IsoDate
  onClose: () => void
}

interface Draft {
  title: string
  emoji: string | null
  days: number[]
  time: IsoTime | null
}

const blank = (): Draft => ({ title: '', emoji: null, days: [...ALL_DAYS], time: null })

/**
 * Los atajos de días; su nombre es el de `daysLabel` ("Cada día", "Entre semana"…). El último, una vez
 * por semana ("Los martes"), lo añade cada panel con su día.
 */
const PRESETS: readonly (readonly number[])[] = [ALL_DAYS, WORKDAYS, WEEKEND]

const COPY = {
  es: {
    newRoutine: 'Nueva rutina',
    routine: 'Rutina',
    changeEmoji: (emoji: string) => `Emoji ${emoji}: cambiar`,
    pickEmoji: 'Elegir emoji',
    placeholder: 'Tomar creatina',
    name: 'Nombre de la rutina',
    days: 'Días',
    weekdays: 'Días de la semana',
    reminder: 'Aviso',
    noReminder: 'Sin aviso',
    at: (clock: string) => `A las ${clock}`,
    atTime: 'A una hora',
    actions: 'Acciones',
    remove: 'Borrar rutina',
    add: 'Añadir rutina',
  },
  en: {
    newRoutine: 'New routine',
    routine: 'Routine',
    changeEmoji: (emoji: string) => `Emoji ${emoji}: change`,
    pickEmoji: 'Pick an emoji',
    placeholder: 'Take creatine',
    name: 'Routine name',
    days: 'Days',
    weekdays: 'Days of the week',
    reminder: 'Reminder',
    noReminder: 'No reminder',
    at: (clock: string) => `At ${clock}`,
    atTime: 'At a time',
    actions: 'Actions',
    remove: 'Delete routine',
    add: 'Add routine',
  },
} as const

const same = (a: readonly number[], b: readonly number[]) => a.length === b.length && a.every((day, index) => day === b[index])

/**
 * Crear o editar una rutina: nombre, emoji, qué días toca y a qué hora avisa. Una nueva propone el
 * emoji que le pega al nombre hasta que se elige uno a mano. Una existente enseña además
 * su constancia día a día, que se puede corregir (`RoutineLog`). Los
 * cambios de una existente se aplican al momento; una nueva se crea al cerrar si tiene nombre.
 */
export function RoutineSheet({ routineId, today, onClose }: RoutineSheetProps) {
  const state = useAppState()
  const copy = useCopy(COPY)
  const dispatch = useDispatch()
  const { removeRoutine } = useTaskActions()
  // Se conserva la última para animar el cierre sin que cambie el contenido.
  const [shownId, setShownId] = useState<string | null>(routineId)
  const routine = shownId ? (state.routines.find((item) => item.id === shownId) ?? null) : null
  const [draft, setDraft] = useState<Draft>(blank)
  const [picking, setPicking] = useState(false)
  // El emoji elegido (o quitado) a mano ya no lo cambia el nombre.
  const [chosen, setChosen] = useState(false)
  const titleInput = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (routineId === null) return
    setShownId(routineId)
    setPicking(false)
    setChosen(false)
    const current = routineId ? state.routines.find((item) => item.id === routineId) : undefined
    setDraft(current ? { title: current.title, emoji: current.emoji, days: current.days, time: current.time } : blank())
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
    if (routine && (patch.days !== undefined || patch.time !== undefined || patch.emoji !== undefined)) {
      dispatch({ type: 'routine/update', id: routine.id, days: next.days, time: next.time, emoji: next.emoji })
    }
  }

  const rename = (title: string) => setDraft({ ...draft, title, emoji: routine || chosen ? draft.emoji : suggestEmoji(title) })

  const pickEmoji = (emoji: string | null) => {
    haptic('selection')
    setChosen(true)
    setPicking(false)
    update({ emoji })
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
      dispatch({ type: 'routine/add', id: createId(), title: draft.title, days: draft.days, time: draft.time, emoji: draft.emoji })
      haptic('success')
    }
    onClose()
  }

  const isNew = shownId === ''

  return (
    <Sheet open={routineId !== null} onClose={close} title={isNew ? copy.newRoutine : copy.routine}>
      <div className="routine-name">
        <button
          type="button"
          className={`routine-seal ${draft.emoji ? 'is-set' : ''} ${picking ? 'is-open' : ''}`}
          aria-expanded={picking}
          aria-label={draft.emoji ? copy.changeEmoji(draft.emoji) : copy.pickEmoji}
          onClick={() => setPicking((open) => !open)}
        >
          {draft.emoji ? (
            // Con `key`, el emoji nuevo entra con su pequeño rebote.
            <span key={draft.emoji} className="emoji routine-seal__emoji" aria-hidden="true">
              {draft.emoji}
            </span>
          ) : (
            <IconSmile size={21} />
          )}
        </button>
        <textarea
          ref={titleInput}
          className="sheet__input"
          rows={1}
          value={draft.title}
          placeholder={isNew ? copy.placeholder : undefined}
          autoFocus={isNew}
          aria-label={copy.name}
          onChange={(event) => rename(event.target.value.replace(/\n/g, ' '))}
          onBlur={commitTitle}
        />
      </div>
      {picking && <EmojiPicker value={draft.emoji} onChange={pickEmoji} />}

      <p className="sheet__title">{copy.days}</p>
      <div className="days-picker" role="group" aria-label={copy.weekdays}>
        {dayLetters().map((letter, index) => {
          const day = index + 1
          const active = draft.days.includes(day)
          return (
            <button
              key={index}
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
        {[...PRESETS, weeklyPreset(draft.days, today)].map((days) => (
          <button
            key={days.join('')}
            type="button"
            className={`chip ${same(draft.days, days) ? 'is-active' : ''}`}
            onClick={() => update({ days: [...days] })}
          >
            {daysLabel(days)}
          </button>
        ))}
      </div>

      <p className="sheet__title">{copy.reminder}</p>
      <div className="sheet__chips">
        <button type="button" className={`chip ${draft.time === null ? 'is-active' : ''}`} onClick={() => update({ time: null })}>
          {copy.noReminder}
        </button>
        <PickerChip
          type="time"
          className={`chip ${draft.time ? 'is-active' : ''}`}
          value={draft.time ?? ''}
          onCommit={(value) => update({ time: value || null })}
        >
          {draft.time ? copy.at(shortTime(draft.time)) : copy.atTime}
        </PickerChip>
      </div>

      {routine && <RoutineLog key={routine.id} routine={routine} today={today} />}

      {routine && (
        <>
          <p className="sheet__title">{copy.actions}</p>
          <button
            type="button"
            className="sheet__row sheet__row--danger"
            onClick={() => {
              removeRoutine(routine.id)
              onClose()
            }}
          >
            <IconTrash size={18} />
            {copy.remove}
          </button>
        </>
      )}

      {isNew && (
        <button type="button" className="sheet__primary" disabled={!draft.title.trim()} onClick={close}>
          {copy.add}
        </button>
      )}
    </Sheet>
  )
}
