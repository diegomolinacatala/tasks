import { useAppState } from '../../state/StoreProvider'
import { IconPin, IconPlus } from '../ui/Icons'
import { usePlaceEditor } from './PlaceEditor'
import './places.css'

/** Lugares guardados en Ajustes. Solo en la app de iPhone. */
export function PlacesBlock() {
  const { places, tasks } = useAppState()
  const openPlace = usePlaceEditor()

  const pendingAt = (placeId: string) =>
    tasks.filter((task) => !task.done && task.reminders.some((reminder) => reminder.kind === 'place' && reminder.placeId === placeId))
      .length

  return (
    <>
      <p className="sheet__title">Lugares</p>
      {places.map((place) => {
        const pending = pendingAt(place.id)
        const detail = place.location
          ? [place.location.address, pending ? `${pending} ${pending === 1 ? 'tarea' : 'tareas'}` : ''].filter(Boolean).join(' · ')
          : 'Sin ubicación'
        return (
          <button
            key={place.id}
            type="button"
            className={`sheet__row place-row ${place.location ? '' : 'is-unset'}`}
            onClick={() => openPlace({ placeId: place.id })}
          >
            <IconPin size={18} />
            <span className="place-row__text">
              {place.name}
              {detail && <span className="place-row__detail">{detail}</span>}
            </span>
          </button>
        )
      })}
      <button type="button" className="sheet__row" onClick={() => openPlace({ placeId: null })}>
        <IconPlus size={18} />
        Añadir lugar
      </button>
    </>
  )
}
