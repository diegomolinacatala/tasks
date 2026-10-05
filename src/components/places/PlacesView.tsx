import { useEffect, useMemo, useRef, useState } from 'react'
import { compareNames } from '../../lib/order'
import { DEFAULT_RADIUS, distanceMeters, formatDistance } from '../../lib/places'
import { isNative, showsPlaces } from '../../lib/platform'
import { pickOnMap } from '../../lib/platform/mapPicker'
import type { PermissionStatus } from '../../lib/platform/native'
import { useCopy } from '../../state/LanguageProvider'
import { useAppState } from '../../state/StoreProvider'
import type { Place, Task } from '../../types'
import { IconArrowUpRight, IconExpand, IconLocate, IconMap, IconPin, IconPlus, IconSearch } from '../ui/Icons'
import { useToast } from '../ui/Toast'
import { MapSnapshot } from './MapSnapshot'
import { usePlaceEditor } from './PlaceEditor'
import './places.css'

const APP_STORE = 'https://apps.apple.com/app/id6812776586'
const MAP_HEIGHT = 230
/** Metros de norte a sur del mapa de donde estás, cuando aún no hay lugares. */
const NEARBY_SPAN = 1600
const PREVIEW_TASKS = 3

const COPY = {
  es: {
    count: (count: number) => (count === 1 ? '1 sitio' : `${count} sitios`),
    title: 'Lugares',
    search: 'Buscar o añadir un lugar',
    blocked: 'Ubicación bloqueada: los avisos por lugar no pueden sonar.',
    saved: 'Ubicación guardada',
    unset: 'Sin ubicación: toca para elegirla',
    openMap: 'Abrir el mapa',
    newPlace: 'Nuevo lugar',
    addHere: 'Añadir aquí',
    close: 'Cerrar',
    locate: 'Mi ubicación',
    mapFailed: 'No se ha podido abrir el mapa.',
    onlyIphone: 'Solo en iPhone',
    pitch: 'Avisos al llegar o al salir de un sitio: «al pasar por Mercadona, comprar leche».',
    store: 'Descargar en la App Store',
  },
  en: {
    count: (count: number) => (count === 1 ? '1 place' : `${count} places`),
    title: 'Places',
    search: 'Search or add a place',
    blocked: 'Location blocked: place reminders can’t go off.',
    saved: 'Saved location',
    unset: 'No location: tap to choose it',
    openMap: 'Open the map',
    newPlace: 'New place',
    addHere: 'Add here',
    close: 'Close',
    locate: 'My location',
    mapFailed: 'Couldn’t open the map.',
    onlyIphone: 'iPhone only',
    pitch: 'Reminders when you arrive at or leave a place: “when I get to Walmart, buy milk”.',
    store: 'Download on the App Store',
  },
} as const

type Point = { lat: number; lng: number }

/**
 * Lugares, al estilo de Google Maps: arriba el mapa con tus sitios, que se tocan para abrirlos;
 * debajo, cada lugar en su tarjeta con lo que tienes pendiente allí y lo lejos que está. Los avisos
 * por lugar solo existen en la app de iPhone: en la web, la pestaña lo dice y lleva a la App Store.
 */
export function PlacesView() {
  if (!showsPlaces) return <PlacesUnavailable />
  return <PlacesList />
}

function PlacesList() {
  const { places, tasks } = useAppState()
  const openPlace = usePlaceEditor()
  const copy = useCopy(COPY)
  const toast = useToast()
  const [permission, setPermission] = useState<PermissionStatus | null>(null)
  const [here, setHere] = useState<Point | null>(null)

  // La distancia solo si ya hay permiso: abrir la pestaña no debe pedir la ubicación.
  useEffect(() => {
    if (!isNative) return
    let cancelled = false
    void import('../../lib/platform/native')
      .then(async ({ TasksNative }) => {
        const { status } = await TasksNative.locationStatus()
        if (cancelled) return
        setPermission(status)
        if (status !== 'granted') return
        const { lat, lng } = await TasksNative.currentPosition()
        if (!cancelled) setHere({ lat, lng })
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [])

  const located = useMemo(() => places.filter((place): place is Place & { location: NonNullable<Place['location']> } => place.location !== null), [places])
  const pendingAt = useMemo(() => {
    const map = new Map<string, Task[]>()
    for (const task of tasks) {
      if (task.done) continue
      for (const reminder of task.reminders) {
        if (reminder.kind !== 'place') continue
        const list = map.get(reminder.placeId) ?? []
        if (!list.includes(task)) map.set(reminder.placeId, [...list, task])
      }
    }
    return map
  }, [tasks])

  /** El mapa de verdad: se elige el punto y se le pone nombre en el panel del lugar nuevo. */
  const mapOpen = useRef(false)
  const addOnMap = async () => {
    // Un doble toque no abre dos mapas.
    if (mapOpen.current) return
    mapOpen.current = true
    try {
      const picked = await pickOnMap({
        title: copy.newPlace,
        confirm: copy.addHere,
        cancel: copy.close,
        locate: copy.locate,
        radius: DEFAULT_RADIUS,
        places: located.map((place) => ({ name: place.name, lat: place.location.lat, lng: place.location.lng, radius: place.radius })),
      })
      if (picked) openPlace({ placeId: null, name: picked.name ?? '', location: picked.location })
    } catch {
      toast({ message: copy.mapFailed })
    } finally {
      mapOpen.current = false
    }
  }

  const sorted = useMemo(() => {
    const distance = (place: Place) => (here && place.location ? distanceMeters(here, place.location) : Number.POSITIVE_INFINITY)
    return [...places].sort((a, b) => distance(a) - distance(b) || compareNames(a.name, b.name))
  }, [places, here])

  return (
    <div className="view places">
      <header className="view__head">
        <p className="view__kicker">{copy.count(places.length)}</p>
        <div className="view__headline">
          <h1 className="view__title">{copy.title}</h1>
        </div>
      </header>

      {/* Tocar el mapa abre el de verdad (en el iPhone), para añadir un sitio señalándolo. */}
      <div className="places__map" onClick={() => void addOnMap()}>
        <MapSnapshot
          points={located.map((place) => place.location)}
          // Sin lugares, el barrio donde estás (si ya hay permiso), no un dibujo.
          {...(!located.length && here ? { center: here, span: NEARBY_SPAN } : {})}
          height={MAP_HEIGHT}
          renderPin={(index) => {
            const place = located[index]
            if (!place) return null
            const count = pendingAt.get(place.id)?.length ?? 0
            return (
              <button
                type="button"
                className={`pin ${count ? 'has-tasks' : ''}`}
                onClick={(event) => {
                  event.stopPropagation()
                  openPlace({ placeId: place.id })
                }}
              >
                <span className="pin__head">
                  <span>{count || <IconPin size={13} strokeWidth={2.2} />}</span>
                </span>
                <span className="pin__label">{place.name}</span>
              </button>
            )
          }}
        />
        {!located.length && !here && (
          <div className="places__map-empty">
            <IconMap size={22} />
          </div>
        )}
        <button
          type="button"
          className="map__expand places__expand"
          aria-label={copy.openMap}
          onClick={(event) => {
            event.stopPropagation()
            void addOnMap()
          }}
        >
          <IconExpand size={15} />
        </button>
      </div>

      <button type="button" className="places__search" onClick={() => openPlace({ placeId: null })}>
        <IconSearch size={17} />
        <span>{copy.search}</span>
        <span className="places__search-plus" aria-hidden="true">
          <IconPlus size={15} />
        </span>
      </button>

      {permission === 'denied' && places.length > 0 && (
        <button
          type="button"
          className="places__warning"
          onClick={() => void import('../../lib/platform/native').then(({ TasksNative }) => TasksNative.openSettings())}
        >
          <IconLocate size={16} />
          <span>{copy.blocked}</span>
          <IconArrowUpRight size={15} />
        </button>
      )}

      <ul className="places__list">
        {sorted.map((place) => {
          const pending = pendingAt.get(place.id) ?? []
          const distance = here && place.location ? formatDistance(distanceMeters(here, place.location)) : null
          const rest = pending.length - PREVIEW_TASKS
          return (
            <li key={place.id}>
              <button type="button" className={`place-card ${place.location ? '' : 'is-unset'}`} onClick={() => openPlace({ placeId: place.id })}>
                <span className="place-card__top">
                  <span className="place-card__name">{place.name}</span>
                  {distance && <span className="place-card__distance">{distance}</span>}
                </span>
                <span className="place-card__address">
                  {place.location ? place.location.address || copy.saved : copy.unset}
                </span>
                {pending.length > 0 && (
                  <span className="place-card__tasks">
                    {pending.slice(0, PREVIEW_TASKS).map((task) => (
                      <span key={task.id} className="place-card__task">
                        {task.title}
                      </span>
                    ))}
                    {rest > 0 && <span className="place-card__more">+{rest}</span>}
                  </span>
                )}
                <span className="place-card__radius">{place.radius} m</span>
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

/** En la web no hay avisos por lugar: la pestaña lo cuenta en una línea y lleva a la app. */
function PlacesUnavailable() {
  const copy = useCopy(COPY)
  return (
    <div className="view places">
      <header className="view__head">
        <p className="view__kicker">{copy.onlyIphone}</p>
        <div className="view__headline">
          <h1 className="view__title">{copy.title}</h1>
        </div>
      </header>
      <div className="places__map">
        <MapSnapshot points={[]} height={MAP_HEIGHT} />
        <div className="places__map-empty">
          <IconPin size={22} />
        </div>
      </div>
      <p className="places__pitch">{copy.pitch}</p>
      <a className="places__store" href={APP_STORE} target="_blank" rel="noopener noreferrer">
        {copy.store}
        <IconArrowUpRight size={15} />
      </a>
    </div>
  )
}
