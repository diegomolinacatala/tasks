import { useEffect, useState } from 'react'
import { createId } from '../../lib/id'
import { DEFAULT_RADIUS, MAX_RADIUS, MIN_RADIUS, cleanPlaceName, findPlace, formatDistance } from '../../lib/places'
import { haptic } from '../../lib/platform/feedback'
import { useCopy } from '../../state/LanguageProvider'
import { useAppState, useDispatch } from '../../state/StoreProvider'
import type { PlaceLocation } from '../../types'
import { IconLocate, IconPin, IconSearch, IconTrash } from '../ui/Icons'
import { Sheet } from '../ui/Sheet'
import { Slider } from '../ui/Slider'
import { useToast } from '../ui/Toast'
import { MapSnapshot } from './MapSnapshot'
import { usePlaceSearch } from './usePlaceSearch'
import './places.css'

export interface PlaceRequest {
  /** `null` = lugar nuevo. */
  placeId: string | null
  /** Nombre propuesto para uno nuevo (lo dicho: "Mercadona"). */
  name?: string
  onSaved?: (placeId: string) => void
}

interface Draft {
  name: string
  location: PlaceLocation | null
  radius: number
}

interface PlaceSheetProps {
  request: PlaceRequest | null
  onClose: () => void
}

const CONFIRM_MS = 4000

const COPY = {
  es: {
    clash: (name: string) => `Ya hay un lugar llamado ${name}.`,
    noPermission: 'Sin permiso de ubicación.',
    settings: 'Ajustes',
    place: 'Lugar',
    newPlace: 'Nuevo lugar',
    name: 'Nombre',
    placeName: 'Nombre del lugar',
    where: 'Dónde',
    saved: 'Ubicación guardada',
    search: 'Buscar en Mapas',
    searchFailed: 'No se ha podido buscar. Revisa la conexión.',
    current: 'Usar mi ubicación actual',
    radius: 'Radio',
    radiusLabel: 'Radio del aviso',
    linked: 'Avisos aquí',
    actions: 'Acciones',
    confirm: 'Toca otra vez para borrar',
    remove: 'Borrar lugar y sus avisos',
  },
  en: {
    clash: (name: string) => `There’s already a place called ${name}.`,
    noPermission: 'No location permission.',
    settings: 'Settings',
    place: 'Place',
    newPlace: 'New place',
    name: 'Name',
    placeName: 'Place name',
    where: 'Where',
    saved: 'Saved location',
    search: 'Search in Maps',
    searchFailed: 'Search failed. Check your connection.',
    current: 'Use my current location',
    radius: 'Radius',
    radiusLabel: 'Reminder radius',
    linked: 'Reminders here',
    actions: 'Actions',
    confirm: 'Tap again to delete',
    remove: 'Delete place and its reminders',
  },
} as const
const RADIUS_STEP = 50
const RADIUS_MARKS = [MIN_RADIUS, 500, MAX_RADIUS] as const
const MAP_HEIGHT = 190
/** Alto del mapa en metros: el radio más grande cabe con aire alrededor. */
const mapSpan = (radius: number) => Math.max(600, radius * 3.2)

/** Crear o editar un lugar. Los cambios se guardan al cerrar. */
export function PlaceSheet({ request, onClose }: PlaceSheetProps) {
  const state = useAppState()
  const dispatch = useDispatch()
  const toast = useToast()
  const copy = useCopy(COPY)
  // Se conserva la última petición para animar el cierre sin que cambie el contenido.
  const [shown, setShown] = useState<PlaceRequest | null>(request)
  const place = shown?.placeId ? (state.places.find((item) => item.id === shown.placeId) ?? null) : null
  const [draft, setDraft] = useState<Draft>({ name: '', location: null, radius: DEFAULT_RADIUS })
  const [query, setQuery] = useState('')
  const [confirming, setConfirming] = useState(false)
  const [locating, setLocating] = useState(false)
  // Radio mientras se arrastra el deslizador: el círculo del mapa lo sigue en vivo.
  const [liveRadius, setLiveRadius] = useState<number | null>(null)
  const search = usePlaceSearch(query, request !== null)
  const radius = liveRadius ?? draft.radius
  const linked = place
    ? state.tasks.filter((task) => !task.done && task.reminders.some((reminder) => reminder.kind === 'place' && reminder.placeId === place.id))
    : []

  useEffect(() => {
    if (!request) return
    setShown(request)
    const current = request.placeId ? state.places.find((item) => item.id === request.placeId) : undefined
    const name = current?.name ?? request.name ?? ''
    setDraft({ name, location: current?.location ?? null, radius: current?.radius ?? DEFAULT_RADIUS })
    // Sin ubicación todavía, se busca directamente por el nombre.
    setQuery(current?.location ? '' : name)
    setConfirming(false)
  }, [request]) // eslint-disable-line react-hooks/exhaustive-deps

  const update = (patch: Partial<Draft>) => setDraft((current) => ({ ...current, ...patch }))

  const close = () => {
    const name = cleanPlaceName(draft.name)
    if (request && name) {
      if (place) {
        // El reducer no deja dos lugares con el mismo nombre: se conserva el anterior y se avisa.
        const clash = findPlace(state.places, name)
        if (clash && clash.id !== place.id) toast({ message: copy.clash(clash.name) })
        dispatch({ type: 'place/update', id: place.id, name, location: draft.location, radius: draft.radius })
        request.onSaved?.(place.id)
      } else {
        // Si ya hay uno con ese nombre se reutiliza: los avisos casan por nombre.
        const existing = findPlace(state.places, name)
        const id = existing?.id ?? createId()
        if (existing) dispatch({ type: 'place/update', id, location: draft.location ?? existing.location, radius: draft.radius })
        else dispatch({ type: 'place/add', id, name, location: draft.location, radius: draft.radius })
        request.onSaved?.(id)
      }
    }
    onClose()
  }

  const pickCurrentLocation = async () => {
    setLocating(true)
    try {
      const { TasksNative } = await import('../../lib/platform/native')
      const { lat, lng } = await TasksNative.currentPosition()
      update({ location: { lat, lng, address: '' } })
      setQuery('')
      haptic('success')
    } catch {
      toast({
        message: copy.noPermission,
        actionLabel: copy.settings,
        onAction: () => void import('../../lib/platform/native').then(({ TasksNative }) => TasksNative.openSettings()),
      })
    } finally {
      setLocating(false)
    }
  }

  const remove = () => {
    if (!place) return
    if (!confirming) {
      setConfirming(true)
      setTimeout(() => setConfirming(false), CONFIRM_MS)
      return
    }
    dispatch({ type: 'place/remove', id: place.id })
    haptic('warning')
    onClose()
  }

  return (
    <Sheet open={request !== null} onClose={close} title={place ? copy.place : copy.newPlace}>
      <input
        className="sheet__input"
        value={draft.name}
        placeholder={copy.name}
        aria-label={copy.placeName}
        autoComplete="off"
        onChange={(event) => update({ name: event.target.value })}
      />

      <p className="sheet__title">{copy.where}</p>
      {draft.location && (
        <>
          <MapSnapshot
            className="place-sheet__map"
            points={[draft.location]}
            center={draft.location}
            span={mapSpan(draft.radius)}
            radius={radius}
            height={MAP_HEIGHT}
            renderPin={() => <span className="place-sheet__center" />}
          />
          <p className="place-current">
            <IconPin size={16} />
            <span>{draft.location.address || copy.saved}</span>
          </p>
        </>
      )}

      <label className="place-search">
        <IconSearch size={16} />
        <input
          value={query}
          placeholder={copy.search}
          aria-label={copy.search}
          enterKeyHint="search"
          autoComplete="off"
          onChange={(event) => setQuery(event.target.value)}
        />
      </label>

      {search.results.length > 0 && (
        <ul className="place-results">
          {search.results.map((result) => (
            <li key={`${result.lat},${result.lng},${result.name}`}>
              <button
                type="button"
                className="place-result"
                onClick={() => {
                  update({
                    location: { lat: result.lat, lng: result.lng, address: result.address },
                    name: draft.name.trim() ? draft.name : result.name,
                  })
                  setQuery('')
                  haptic('success')
                }}
              >
                <span className="place-result__name">{result.name}</span>
                <span className="place-result__detail">
                  {[result.distance !== null ? formatDistance(result.distance) : '', result.address].filter(Boolean).join(' · ')}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {search.failed && <p className="sheet__note">{copy.searchFailed}</p>}

      <button type="button" className="sheet__row" disabled={locating} onClick={() => void pickCurrentLocation()}>
        <IconLocate size={18} />
        {copy.current}
      </button>

      <p className="sheet__title">{copy.radius}</p>
      <Slider
        value={draft.radius}
        min={MIN_RADIUS}
        max={MAX_RADIUS}
        step={RADIUS_STEP}
        label={copy.radiusLabel}
        format={(value) => formatDistance(value)}
        marks={RADIUS_MARKS}
        onInput={setLiveRadius}
        onChange={(value) => {
          setLiveRadius(null)
          update({ radius: value })
        }}
      />

      {linked.length > 0 && (
        <>
          <p className="sheet__title">{copy.linked}</p>
          <ul className="place-linked">
            {linked.map((task) => (
              <li key={task.id}>{task.title}</li>
            ))}
          </ul>
        </>
      )}

      {place && (
        <>
          <p className="sheet__title">{copy.actions}</p>
          <button type="button" className="sheet__row sheet__row--danger" onClick={remove}>
            <IconTrash size={18} />
            {confirming ? copy.confirm : copy.remove}
          </button>
        </>
      )}
    </Sheet>
  )
}
