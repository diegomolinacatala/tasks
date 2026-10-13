import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { suggestEmoji } from '../../lib/emoji'
import { createId } from '../../lib/id'
import { haptic } from '../../lib/platform/feedback'
import { ALL_DAYS, MAX_ROUTINES, WEEKEND, WORKDAYS, cleanDays, dayLetters, daysLabel, weeklyPreset } from '../../lib/routines'
import { useCopy } from '../../state/LanguageProvider'
import { useAppState, useDispatch } from '../../state/StoreProvider'
import type { IsoDate, IsoTime } from '../../types'
import { TimeField } from '../task/fields'
import { useTaskActions } from '../task/useTaskActions'
import { IconSmile, IconTrash } from '../ui/Icons'
import { Sheet } from '../ui/Sheet'
import { useToast } from '../ui/Toast'
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
    placeholder: 'p. ej. Tomar creatina',
    name: 'Nombre de la rutina',
    days: 'Días',
    weekdays: 'Días de la semana',
    reminder: 'Aviso',
    noReminder: 'Sin aviso',
    actions: 'Acciones',
    remove: 'Borrar rutina',
    add: 'Añadir rutina',
    added: (name: string) => `Rutina: ${name}`,
    undo: 'Deshacer',
    full: `Ya hay ${MAX_ROUTINES} rutinas: borra alguna para añadir otra.`,
  },
  en: {
    newRoutine: 'New routine',
    routine: 'Routine',
    changeEmoji: (emoji: string) => `Emoji ${emoji}: change`,
    pickEmoji: 'Pick an emoji',
    placeholder: 'e.g. Take creatine',
    name: 'Routine name',
    days: 'Days',
    weekdays: 'Days of the week',
    reminder: 'Reminder',
    noReminder: 'No reminder',
    actions: 'Actions',
    remove: 'Delete routine',
    add: 'Add routine',
    added: (name: string) => `Routine: ${name}`,
    undo: 'Undo',
    full: `You already have ${MAX_ROUTINES} routines: delete one to add another.`,
  },
} as const

const same = (a: readonly number[], b: readonly number[]) => a.length === b.length && a.every((day, index) => day === b[index])

/**
 * Crear o editar una rutina: nombre, emoji, qué días toca y a qué hora avisa. Una nueva propone el
 * emoji que le pega al nombre hasta que se elige uno a mano. Una existente enseña además
 * su constancia día a día, que se puede corregir (`RoutineLog`). Los cambios de una existente se
 * aplican al momento; una nueva se crea con el botón del pie (siempre a mano, también con el teclado
 * fuera) y cerrar el panel la descarta, como en cualquier panel de iOS.
 */
export function RoutineSheet({ routineId, today, onClose }: RoutineSheetProps) {
  const state = useAppState()
  const copy = useCopy(COPY)
  const dispatch = useDispatch()
  const toast = useToast()
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
    onClose()
  }

  const isNew = shownId === ''
  const full = state.routines.length >= MAX_ROUTINES

  /** Solo desde el botón del pie: con "Deshacer" en el aviso, por si se creó sin querer. */
  const create = () => {
    const title = draft.title.trim()
    if (!title || full) return
    const id = createId()
    const { days, time, emoji } = draft
    dispatch({ type: 'routine/add', id, title, days, time, emoji })
    haptic('success')
    toast({
      message: copy.added(`${emoji ? `${emoji} ` : ''}${title} · ${daysLabel(days).toLowerCase()}`),
      actionLabel: copy.undo,
      onAction: () => dispatch({ type: 'routine/remove', id }),
    })
    onClose()
  }

  const footer = isNew ? (
    <button type="button" className="sheet__primary" disabled={!draft.title.trim() || full} onClick={create}>
      {copy.add}
    </button>
  ) : undefined

  return (
    <Sheet open={routineId !== null} onClose={close} title={isNew ? copy.newRoutine : copy.routine} footer={footer}>
      {isNew && full && <p className="sheet__note">{copy.full}</p>}
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

      {/* El mismo campo que el de la hora de una tarea ("Elegir hora…", y elegida, "10:00"): aquí es la del aviso. */}
      <TimeField time={draft.time} onChange={(time) => update({ time })} title={copy.reminder} noneLabel={copy.noReminder} />

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

    </Sheet>
  )
}
