import { useState } from 'react'
import type { ReactNode } from 'react'
import { toInstant } from '../../lib/date'
import { isNative } from '../../lib/platform'
import { isPending, reminderLabel, reminderPresets } from '../../lib/reminders'
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
    title: 'Recordatorios',
    remove: (label: string) => `Quitar recordatorio ${label}`,
    add: '+ Añadir',
    other: 'Otra…',
    arrive: 'Al llegar',
    leave: 'Al salir',
    otherPlace: 'Otro lugar…',
    place: 'Lugar…',
    where: (name: string) => `Elegir dónde está ${name}`,
    enable: 'Activar avisos en este dispositivo',
    install: 'Para recibir avisos, añade la app a la pantalla de inicio.',
    blockedOpen: 'Avisos bloqueados: abrir Ajustes',
    blocked: 'Avisos bloqueados en los ajustes del sistema.',
  },
  en: {
    past: 'That time has already passed.',
    title: 'Reminders',
    remove: (label: string) => `Remove reminder ${label}`,
    add: '+ Add',
    other: 'Other…',
    arrive: 'Arriving',
    leave: 'Leaving',
    otherPlace: 'Other place…',
    place: 'Place…',
    where: (name: string) => `Choose where ${name} is`,
    enable: 'Turn on reminders on this device',
    install: 'To get reminders, add the app to your Home Screen.',
    blockedOpen: 'Reminders blocked: open Settings',
    blocked: 'Reminders are blocked in the system settings.',
  },
} as const

const LOCAL_DATETIME = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/
/** Más lugares que estos en la fila de opciones abruman; el resto, desde "Otro lugar…". */
const MAX_PLACE_OPTIONS = 5

export function ReminderPicker({ task, onAdd, onRemove, leading }: ReminderPickerProps) {
  const { places } = useAppState()
  const openPlace = usePlaceEditor()
  const toast = useToast()
  const copy = useCopy(COPY)
  const [adding, setAdding] = useState(false)
  const [trigger, setTrigger] = useState<PlaceTrigger>('arrive')
  const now = Date.now()
  const presets = adding ? reminderPresets(task, now) : []

  const addAt = (value: string) => {
    const match = LOCAL_DATETIME.exec(value)
    if (!match?.[1] || !match[2]) return
    const at = toInstant(match[1], match[2])
    if (at <= Date.now()) {
      toast({ message: copy.past })
      return
    }
    onAdd({ kind: 'at', at })
    setAdding(false)
  }

  const addPlace = (placeId: string) => {
    onAdd({ kind: 'place', placeId, on: trigger })
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
      <p className="sheet__title">{copy.title}</p>
      <div className="sheet__chips">
        {leading}
        {task.reminders.map((reminder) => {
          const label = reminderLabel(reminder, now, places)
          return (
            <button
              key={reminder.id}
              type="button"
              className={`chip chip--reminder ${isActive(reminder) ? '' : 'is-muted'}`}
              aria-label={copy.remove(label)}
              onClick={() => onRemove(reminder.id)}
            >
              {reminder.kind === 'place' ? <IconPin size={13} /> : <IconBell size={13} />}
              {label}
              <IconClose size={12} className="chip__remove" />
            </button>
          )
        })}

        {!adding && (
          <button type="button" className="chip" onClick={() => setAdding(true)}>
            {copy.add}
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

        {adding && (
          <PickerChip type="datetime-local" className="chip chip--option" value="" onCommit={addAt}>
            {copy.other}
          </PickerChip>
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
            {trigger === 'arrive' ? copy.arrive : copy.leave}
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
