import { useEffect, useState } from 'react'
import { createId } from '../../lib/id'
import { DEFAULT_RADIUS, RADIUS_OPTIONS, cleanPlaceName, findPlace, formatDistance } from '../../lib/places'
import { haptic } from '../../lib/platform/feedback'
import { useAppState, useDispatch } from '../../state/StoreProvider'
import type { PlaceLocation } from '../../types'
import { IconLocate, IconPin, IconSearch, IconTrash } from '../ui/Icons'
import { Sheet } from '../ui/Sheet'
import { useToast } from '../ui/Toast'
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

/** Crear o editar un lugar. Los cambios se guardan al cerrar. */
export function PlaceSheet({ request, onClose }: PlaceSheetProps) {
  const state = useAppState()
  const dispatch = useDispatch()
  const toast = useToast()
  // Se conserva la última petición para animar el cierre sin que cambie el contenido.
  const [shown, setShown] = useState<PlaceRequest | null>(request)
  const place = shown?.placeId ? (state.places.find((item) => item.id === shown.placeId) ?? null) : null
  const [draft, setDraft] = useState<Draft>({ name: '', location: null, radius: DEFAULT_RADIUS })
  const [query, setQuery] = useState('')
  const [confirming, setConfirming] = useState(false)
  const [locating, setLocating] = useState(false)
  const search = usePlaceSearch(query, request !== null)

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
        if (clash && clash.id !== place.id) toast({ message: `Ya hay un lugar llamado ${clash.name}.` })
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
        message: 'Sin permiso de ubicación.',
        actionLabel: 'Ajustes',
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
    <Sheet open={request !== null} onClose={close} title={place ? 'Lugar' : 'Nuevo lugar'}>
      <input
        className="sheet__input"
        value={draft.name}
        placeholder="Nombre"
        aria-label="Nombre del lugar"
        autoComplete="off"
        onChange={(event) => update({ name: event.target.value })}
      />

      <p className="sheet__title">Dónde</p>
      {draft.location && (
        <p className="place-current">
          <IconPin size={16} />
          <span>{draft.location.address || 'Ubicación guardada'}</span>
        </p>
      )}

      <label className="place-search">
        <IconSearch size={16} />
        <input
          value={query}
          placeholder="Buscar en Mapas"
          aria-label="Buscar en Mapas"
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
      {search.failed && <p className="sheet__note">No se ha podido buscar. Revisa la conexión.</p>}

      <button type="button" className="sheet__row" disabled={locating} onClick={() => void pickCurrentLocation()}>
        <IconLocate size={18} />
        Usar mi ubicación actual
      </button>

      <p className="sheet__title">Radio</p>
      <div className="sheet__chips">
        {RADIUS_OPTIONS.map((radius) => (
          <button
            key={radius}
            type="button"
            className={`chip ${draft.radius === radius ? 'is-active' : ''}`}
            onClick={() => update({ radius })}
          >
            {radius} m
          </button>
        ))}
      </div>

      {place && (
        <>
          <p className="sheet__title">Acciones</p>
          <button type="button" className="sheet__row sheet__row--danger" onClick={remove}>
            <IconTrash size={18} />
            {confirming ? 'Toca otra vez para borrar' : 'Borrar lugar y sus avisos'}
          </button>
        </>
      )}
    </Sheet>
  )
}
