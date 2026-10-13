import { useState } from 'react'
import type { ReactNode } from 'react'
import { isoOfInstant, timeOfInstant, toInstant } from '../../lib/date'
import { isNative } from '../../lib/platform'
import { MAX_REMINDERS, isPending, reminderIssue, reminderLabel, reminderPresets } from '../../lib/reminders'
import type { ReminderIssue } from '../../lib/reminders'
import { useCopy } from '../../state/LanguageProvider'
import { useAppState } from '../../state/StoreProvider'
import type { PlaceTrigger, Reminder, ReminderDraft, Task } from '../../types'
import { usePlaceEditor } from '../places/PlaceEditor'
import { usePush } from '../push/PushProvider'
import { IconBell, IconClose, IconPin } from '../ui/Icons'
import { PickerChip } from '../ui/PickerChip'
import { useToast } from '../ui/Toast'

interface ReminderPickerProps {
  /** La tarea (o la que se está escribiendo): de ella salen los atajos y qué avisos siguen activos. */
  task: Task
  onAdd: (reminder: ReminderDraft) => void
  onRemove: (reminderId: string) => void
  /** Delante de los avisos (en la ficha del compositor, el lugar nuevo que se nombró). */
  leading?: ReactNode
}

const COPY = {
  es: {
    past: 'Esa hora ya ha pasado.',
    title: 'Avisos',
    remove: (label: string) => `Quitar el aviso ${label}`,
    removed: 'Aviso quitado',
    undo: 'Deshacer',
    change: (label: string) => `Cambiar el aviso ${label}`,
    add: '+ Añadir',
    done: 'Listo',
    full: `Como mucho ${MAX_REMINDERS} avisos por tarea.`,
    other: 'Otra…',
    arrive: 'Al llegar',
    leave: 'Al salir',
    otherPlace: 'Otro lugar…',
    place: 'Lugar…',
    where: (name: string) => `Elegir dónde está ${name}`,
    issue: { 'no-time': 'sin hora', past: 'pasado', 'no-place': 'sin ubicar', 'phone-only': 'solo en el iPhone' },
    enable: 'Activar avisos en este dispositivo',
    install: 'Para recibir avisos, añade la app a la pantalla de inicio.',
    blockedOpen: 'Avisos bloqueados: abrir Ajustes del iPhone',
    blocked: 'Avisos bloqueados en los ajustes del sistema.',
  },
  en: {
    past: 'That time has already passed.',
    title: 'Reminders',
    remove: (label: string) => `Remove the reminder ${label}`,
    removed: 'Reminder removed',
    undo: 'Undo',
    change: (label: string) => `Change the reminder ${label}`,
    add: '+ Add',
    done: 'Done',
    full: `At most ${MAX_REMINDERS} reminders per task.`,
    other: 'Other…',
    arrive: 'Arriving',
    leave: 'Leaving',
    otherPlace: 'Other place…',
    place: 'Place…',
    where: (name: string) => `Choose where ${name} is`,
    issue: { 'no-time': 'no time', past: 'past', 'no-place': 'no location', 'phone-only': 'iPhone only' },
    enable: 'Turn on reminders on this device',
    install: 'To get reminders, add the app to your Home Screen.',
    blockedOpen: 'Reminders blocked: open iPhone Settings',
    blocked: 'Reminders are blocked in the system settings.',
  },
} as const

const LOCAL_DATETIME = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/
/** Más lugares que estos en la fila de opciones abruman; el resto, desde "Otro lugar…". */
const MAX_PLACE_OPTIONS = 5
const TRIGGERS: readonly PlaceTrigger[] = ['arrive', 'leave']

/** Lo que entiende un `<input type="datetime-local">`, en hora local. */
const localDateTime = (at: number) => `${isoOfInstant(at)}T${timeOfInstant(at)}`

/**
 * Los avisos de una tarea: cada uno es una píldora con su × aparte (quitarlo se deshace desde el
 * aviso) y, en los de fecha, el cuerpo abre el selector para cambiarlo. Uno que no va a sonar dice por
 * qué ("· sin hora", "· pasado"). "+ Añadir" despliega los atajos y pasa a "Listo".
 */
export function ReminderPicker({ task, onAdd, onRemove, leading }: ReminderPickerProps) {
  const { places } = useAppState()
  const openPlace = usePlaceEditor()
  const toast = useToast()
  const copy = useCopy(COPY)
  const [adding, setAdding] = useState(false)
  const [trigger, setTrigger] = useState<PlaceTrigger>('arrive')
  const now = Date.now()
  const full = task.reminders.length >= MAX_REMINDERS
  const presets = adding && !full ? reminderPresets(task, now) : []

  const parseLocal = (value: string): number | null => {
    const match = LOCAL_DATETIME.exec(value)
    if (!match?.[1] || !match[2]) return null
    const at = toInstant(match[1], match[2])
    if (at <= Date.now()) {
      toast({ message: copy.past })
      return null
    }
    return at
  }

  const addAt = (value: string) => {
    const at = parseLocal(value)
    if (at === null) return
    onAdd({ kind: 'at', at })
    setAdding(false)
  }

  /** Cambiar la hora de un aviso de fecha: el viejo se va y entra el nuevo. */
  const retime = (reminder: Reminder, value: string) => {
    const at = parseLocal(value)
    if (at === null || (reminder.kind === 'at' && at === reminder.at)) return
    onRemove(reminder.id)
    onAdd({ kind: 'at', at })
  }

  const removeWithUndo = (reminder: Reminder) => {
    onRemove(reminder.id)
    const { id: _id, ...draft } = reminder
    toast({ message: copy.removed, actionLabel: copy.undo, onAction: () => onAdd(draft) })
  }

  const addPlace = (placeId: string) => {
    onAdd({ kind: 'place', placeId, on: trigger })
    setAdding(false)
  }

  const usedPlaces = new Set(
    task.reminders.flatMap((reminder) => (reminder.kind === 'place' && reminder.on === trigger ? [reminder.placeId] : [])),
  )
  const placeOptions = places.filter((place) => !usedPlaces.has(place.id)).slice(0, MAX_PLACE_OPTIONS)

  // Los de lugar solo suenan en el iPhone: en la web (una copia importada) no están activos.
  const isActive = (reminder: Reminder) =>
    reminder.kind === 'place'
      ? isNative && !task.done && Boolean(places.find((place) => place.id === reminder.placeId)?.location)
      : isPending(task, reminder, now)

  const unset = places.filter(
    (place) => !place.location && task.reminders.some((reminder) => reminder.kind === 'place' && reminder.placeId === place.id),
  )

  const chip = (reminder: Reminder) => {
    const label = reminderLabel(reminder, now, places)
    const active = isActive(reminder)
    const issue: ReminderIssue | null = active ? null : reminderIssue(task, reminder, now, places, isNative)
    const className = `chip chip--reminder ${active ? '' : 'is-muted'}`
    const body = (
      <>
        {reminder.kind === 'place' ? <IconPin size={13} /> : <IconBell size={13} />}
        {label}
        {issue && <span className="chip__why">· {copy.issue[issue]}</span>}
      </>
    )
    const clear = (
      <button
        type="button"
        className="chip__clear"
        aria-label={copy.remove(label)}
        onClick={(event) => {
          // Dentro de la píldora: quitarlo no debe abrir también el selector.
          event.preventDefault()
          event.stopPropagation()
          removeWithUndo(reminder)
        }}
      >
        <IconClose size={12} className="chip__remove" />
      </button>
    )
    if (reminder.kind === 'at') {
      return (
        <PickerChip
          key={reminder.id}
          type="datetime-local"
          className={className}
          value={localDateTime(reminder.at)}
          min={localDateTime(now)}
          onCommit={(value) => retime(reminder, value)}
        >
          {body}
          {clear}
        </PickerChip>
      )
    }
    return (
      <span key={reminder.id} className={className}>
        {body}
        {clear}
      </span>
    )
  }

  return (
    <>
      <p className="sheet__title">{copy.title}</p>
      <div className="sheet__chips">
        {leading}
        {task.reminders.map(chip)}

        {/* Lo hecho ya no avisa de nada; al tope, tampoco hay dónde añadir. */}
        {!task.done && !full && (
          <button
            type="button"
            className={`chip ${adding ? 'is-active' : ''}`}
            aria-expanded={adding}
            onClick={() => setAdding((current) => !current)}
          >
            {adding ? copy.done : copy.add}
          </button>
        )}

        {presets.map((preset) => (
          <button
            key={preset.key}
            type="button"
            className="chip chip--option"
            onClick={() => {
              onAdd(preset.draft)
              setAdding(false)
            }}
          >
            {preset.label}
          </button>
        ))}

        {adding && !full && (
          <PickerChip type="datetime-local" className="chip chip--option" value="" min={localDateTime(now)} onCommit={addAt}>
            {copy.other}
          </PickerChip>
        )}
      </div>
      {full && !task.done && <p className="sheet__note">{copy.full}</p>}

      {adding && !full && isNative && (
        <div className="sheet__chips sheet__chips--places">
          {TRIGGERS.map((on) => (
            <button
              key={on}
              type="button"
              className={`chip ${trigger === on ? 'is-active' : ''}`}
              aria-pressed={trigger === on}
              onClick={() => setTrigger(on)}
            >
              {on === 'arrive' ? copy.arrive : copy.leave}
            </button>
          ))}
          {placeOptions.map((place) => (
            <button key={place.id} type="button" className="chip chip--option" onClick={() => addPlace(place.id)}>
              <IconPin size={13} />
              {reminderLabel({ kind: 'place', placeId: place.id, on: trigger }, now, places)}
            </button>
          ))}
          <button
            type="button"
            className="chip chip--option"
            onClick={() => openPlace({ placeId: null, onSaved: (placeId) => addPlace(placeId) })}
          >
            {places.length ? copy.otherPlace : copy.place}
          </button>
        </div>
      )}

      {unset.map((place) => (
        <button key={place.id} type="button" className="sheet__hint" onClick={() => openPlace({ placeId: place.id })}>
          <IconPin size={14} />
          {copy.where(place.name)}
        </button>
      ))}
      <PushHint hasReminders={task.reminders.length > 0} />
    </>
  )
}

/** Solo aparece si hay recordatorios que no van a llegar. */
function PushHint({ hasReminders }: { hasReminders: boolean }) {
  const push = usePush()
  const copy = useCopy(COPY)
  if (!hasReminders) return null

  if (push.status === 'off') {
    return (
      <button type="button" className="sheet__hint" disabled={push.busy} onClick={() => void push.enable()}>
        <IconBell size={14} />
        {copy.enable}
      </button>
    )
  }
  if (push.status === 'needs-install') {
    return <p className="sheet__note">{copy.install}</p>
  }
  if (push.status === 'denied') {
    return isNative ? (
      <button type="button" className="sheet__hint" onClick={() => void push.disable()}>
        <IconBell size={14} />
        {copy.blockedOpen}
      </button>
    ) : (
      <p className="sheet__note">{copy.blocked}</p>
    )
  }
  return null
}
