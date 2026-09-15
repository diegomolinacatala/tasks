import { useState } from 'react'
import { toInstant } from '../../lib/date'
import { isNative } from '../../lib/platform'
import { isPending, reminderLabel, reminderPresets } from '../../lib/reminders'
import { useAppState, useDispatch } from '../../state/StoreProvider'
import type { PlaceTrigger, Reminder, Task } from '../../types'
import { usePlaceEditor } from '../places/PlaceEditor'
import { usePush } from '../push/PushProvider'
import { IconBell, IconClose, IconPin } from '../ui/Icons'

interface ReminderPickerProps {
  task: Task
}

const LOCAL_DATETIME = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/
/** Más lugares que estos en la fila de opciones abruman; el resto, desde "Otro lugar…". */
const MAX_PLACE_OPTIONS = 5

export function ReminderPicker({ task }: ReminderPickerProps) {
  const { places } = useAppState()
  const dispatch = useDispatch()
  const openPlace = usePlaceEditor()
  const [adding, setAdding] = useState(false)
  const [trigger, setTrigger] = useState<PlaceTrigger>('arrive')
  const now = Date.now()
  const presets = adding ? reminderPresets(task, now) : []

  const addAt = (value: string) => {
    const match = LOCAL_DATETIME.exec(value)
    if (!match?.[1] || !match[2]) return
    const at = toInstant(match[1], match[2])
    if (at <= Date.now()) return
    dispatch({ type: 'reminder/add', taskId: task.id, reminder: { kind: 'at', at } })
    setAdding(false)
  }

  const addPlace = (placeId: string) => {
    dispatch({ type: 'reminder/add', taskId: task.id, reminder: { kind: 'place', placeId, on: trigger } })
    setAdding(false)
  }

  const usedPlaces = new Set(
    task.reminders.flatMap((reminder) => (reminder.kind === 'place' && reminder.on === trigger ? [reminder.placeId] : [])),
  )
  const placeOptions = places.filter((place) => !usedPlaces.has(place.id)).slice(0, MAX_PLACE_OPTIONS)

  const isActive = (reminder: Reminder) =>
    reminder.kind === 'place'
      ? !task.done && Boolean(places.find((place) => place.id === reminder.placeId)?.location)
      : isPending(task, reminder, now)

  const unset = places.filter(
    (place) => !place.location && task.reminders.some((reminder) => reminder.kind === 'place' && reminder.placeId === place.id),
  )

  return (
    <>
      <p className="sheet__title">Recordatorios</p>
      <div className="sheet__chips">
        {task.reminders.map((reminder) => {
          const label = reminderLabel(reminder, now, places)
          return (
            <button
              key={reminder.id}
              type="button"
              className={`chip chip--reminder ${isActive(reminder) ? '' : 'is-muted'}`}
              aria-label={`Quitar recordatorio ${label}`}
              onClick={() => dispatch({ type: 'reminder/remove', taskId: task.id, reminderId: reminder.id })}
            >
              {reminder.kind === 'place' ? <IconPin size={13} /> : <IconBell size={13} />}
              {label}
              <IconClose size={12} className="chip__remove" />
            </button>
          )
        })}

        {!adding && (
          <button type="button" className="chip" onClick={() => setAdding(true)}>
            + Añadir
          </button>
        )}

        {presets.map((preset) => (
          <button
            key={preset.key}
            type="button"
            className="chip chip--option"
            onClick={() => {
              dispatch({ type: 'reminder/add', taskId: task.id, reminder: preset.draft })
              setAdding(false)
            }}
          >
            {preset.label}
          </button>
        ))}

        {adding && (
          <label className="chip chip--option">
            Otra…
            <input
              type="datetime-local"
              className="sr-only"
              onChange={(event) => addAt(event.target.value)}
            />
          </label>
        )}
      </div>

      {adding && isNative && (
        <div className="sheet__chips sheet__chips--places">
          <button
            type="button"
            className={`chip ${trigger === 'leave' ? 'is-active' : ''}`}
            aria-pressed={trigger === 'leave'}
            onClick={() => setTrigger((current) => (current === 'arrive' ? 'leave' : 'arrive'))}
          >
            {trigger === 'arrive' ? 'Al llegar' : 'Al salir'}
          </button>
          {placeOptions.map((place) => (
            <button key={place.id} type="button" className="chip chip--option" onClick={() => addPlace(place.id)}>
              <IconPin size={13} />
              {place.name}
            </button>
          ))}
          <button
            type="button"
            className="chip chip--option"
            onClick={() => openPlace({ placeId: null, onSaved: (placeId) => addPlace(placeId) })}
          >
            {places.length ? 'Otro lugar…' : 'Lugar…'}
          </button>
        </div>
      )}

      {unset.map((place) => (
        <button key={place.id} type="button" className="sheet__hint" onClick={() => openPlace({ placeId: place.id })}>
          <IconPin size={14} />
          Elegir dónde está {place.name}
        </button>
      ))}
      <PushHint hasReminders={task.reminders.length > 0} />
    </>
  )
}

/** Solo aparece si hay recordatorios que no van a llegar. */
function PushHint({ hasReminders }: { hasReminders: boolean }) {
  const push = usePush()
  if (!hasReminders) return null

  if (push.status === 'off') {
    return (
      <button type="button" className="sheet__hint" disabled={push.busy} onClick={() => void push.enable()}>
        <IconBell size={14} />
        Activar avisos en este dispositivo
      </button>
    )
  }
  if (push.status === 'needs-install') {
    return <p className="sheet__note">Para recibir avisos, añade la app a la pantalla de inicio.</p>
  }
  if (push.status === 'denied') {
    return isNative ? (
      <button type="button" className="sheet__hint" onClick={() => void push.disable()}>
        <IconBell size={14} />
        Avisos bloqueados: abrir Ajustes
      </button>
    ) : (
      <p className="sheet__note">Avisos bloqueados en los ajustes del sistema.</p>
    )
  }
  return null
}
