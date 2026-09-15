import { useEffect, useState } from 'react'
import type { PermissionStatus } from '../../lib/platform/native'
import { useAppState } from '../../state/StoreProvider'
import { IconLocate, IconPin, IconPlus } from '../ui/Icons'
import { usePlaceEditor } from './PlaceEditor'
import './places.css'

/** Lugares guardados en Ajustes. Solo en la app de iPhone. */
export function PlacesBlock() {
  const { places, tasks } = useAppState()
  const openPlace = usePlaceEditor()
  const [location, setLocation] = useState<PermissionStatus | null>(null)

  useEffect(() => {
    void import('../../lib/platform/native')
      .then(({ TasksNative }) => TasksNative.locationStatus())
      .then(({ status }) => setLocation(status))
      .catch(() => undefined)
  }, [])

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
      {/* Sin permiso, iOS no deja programar avisos por lugar. */}
      {location === 'denied' && places.length > 0 && (
        <button
          type="button"
          className="sheet__row sheet__row--danger"
          onClick={() => void import('../../lib/platform/native').then(({ TasksNative }) => TasksNative.openSettings())}
        >
          <IconLocate size={18} />
          Ubicación bloqueada: abrir Ajustes
        </button>
      )}
      <button type="button" className="sheet__row" onClick={() => openPlace({ placeId: null })}>
        <IconPlus size={18} />
        Añadir lugar
      </button>
    </>
  )
}
