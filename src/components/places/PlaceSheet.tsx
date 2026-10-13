import { useEffect, useRef, useState } from 'react'
import { createId } from '../../lib/id'
import { plural } from '../../lib/i18n'
import { DEFAULT_RADIUS, MAX_PLACES, MAX_RADIUS, MIN_RADIUS, RADIUS_STOPS, cleanPlaceName, findPlace, formatDistance } from '../../lib/places'
import { haptic } from '../../lib/platform/feedback'
import { pickOnMap } from '../../lib/platform/mapPicker'
import { useCopy } from '../../state/LanguageProvider'
import { useAppState, useDispatch } from '../../state/StoreProvider'
import type { PlaceLocation, Reminder } from '../../types'
import { TaskRow } from '../task/TaskRow'
import { requestOpenTask } from '../task/rowActions'
import { useTaskActions } from '../task/useTaskActions'
import { IconChevronRight, IconExpand, IconLocate, IconMap, IconPin, IconSearch, IconTrash } from '../ui/Icons'
import { Sheet } from '../ui/Sheet'
import { Slider } from '../ui/Slider'
import { useToast } from '../ui/Toast'
import { MapSnapshot } from './MapSnapshot'
import { PlaceAliases } from './PlaceAliases'
import { usePlaceEditor } from './PlaceEditor'
import { usePlaceSearch } from './usePlaceSearch'
import './places.css'

export interface PlaceRequest {
  /** `null` = lugar nuevo. */
  placeId: string | null
  /** Nombre propuesto para uno nuevo (lo dicho: "Mercadona"). */
  name?: string
  /** Dónde está uno nuevo, si ya se eligió (en el mapa de la pestaña Lugares). */
  location?: PlaceLocation
  onSaved?: (placeId: string) => void
}

interface Draft {
  name: string
  aliases: string[]
  location: PlaceLocation | null
  radius: number
}

interface PlaceSheetProps {
  request: PlaceRequest | null
  onClose: () => void
}

const CONFIRM_MS = 4000
/** Desde aquí hay búsqueda (`usePlaceSearch`): con menos letras no se dice "nada con ese nombre". */
const MIN_QUERY = 2

const COPY = {
  es: {
    clash: (name: string) => `Ya hay un lugar llamado «${name}».`,
    exists: (name: string) => `Ya tienes un lugar llamado «${name}».`,
    view: 'Ver',
    noPermission: 'Sin permiso de ubicación.',
    settings: 'Ajustes del iPhone',
    place: 'Lugar',
    newPlace: 'Nuevo lugar',
    name: 'Nombre',
    placeName: 'Nombre del lugar',
    where: 'Dónde',
    saved: 'Ubicación guardada',
    change: 'Cambiar ubicación',
    search: 'Buscar en Mapas',
    searching: 'Buscando…',
    noResults: 'Nada con ese nombre. Elígelo en el mapa.',
    searchFailed: 'No se ha podido buscar. Revisa la conexión.',
    current: 'Usar mi ubicación actual',
    onMap: 'Elegir en el mapa',
    openMap: 'Abrir el mapa para ajustar el punto',
    useSpot: 'Usar este punto',
    close: 'Cerrar',
    locate: 'Mi ubicación',
    mapFailed: 'No se ha podido abrir el mapa.',
    radius: 'Radio del aviso',
    radiusNote: 'Avisa al entrar o salir de este círculo.',
    linked: 'Avisos aquí',
    aliases: 'Otros nombres',
    none: 'Ninguno',
    confirm: 'Toca otra vez para borrar',
    confirmWith: (count: number) => `Borrar y quitar ${plural(count, 'aviso', 'avisos')}`,
    remove: 'Borrar lugar',
    removed: (name: string) => `${name} borrado`,
    undo: 'Deshacer',
    add: 'Añadir lugar',
    full: `Ya hay ${MAX_PLACES} lugares: borra alguno para añadir otro.`,
    discarded: 'Lugar sin guardar',
    back: 'Volver',
    unlocated: (name: string) => `${name} sin ubicación: el aviso no sonará.`,
    locateIt: 'Ubicar',
  },
  en: {
    clash: (name: string) => `There’s already a place called “${name}”.`,
    exists: (name: string) => `You already have a place called “${name}”.`,
    view: 'View',
    noPermission: 'No location permission.',
    settings: 'iPhone Settings',
    place: 'Place',
    newPlace: 'New place',
    name: 'Name',
    placeName: 'Place name',
    where: 'Where',
    saved: 'Saved location',
    change: 'Change location',
    search: 'Search in Maps',
    searching: 'Searching…',
    noResults: 'Nothing by that name. Pick it on the map.',
    searchFailed: 'Search failed. Check your connection.',
    current: 'Use my current location',
    onMap: 'Choose on the map',
    openMap: 'Open the map to adjust the spot',
    useSpot: 'Use this spot',
    close: 'Close',
    locate: 'My location',
    mapFailed: 'Couldn’t open the map.',
    radius: 'Reminder radius',
    radiusNote: 'Reminds you when you enter or leave this circle.',
    linked: 'Reminders here',
    aliases: 'Other names',
    none: 'None',
    confirm: 'Tap again to delete',
    confirmWith: (count: number) => `Delete and remove ${plural(count, 'reminder', 'reminders')}`,
    remove: 'Delete place',
    removed: (name: string) => `${name} deleted`,
    undo: 'Undo',
    add: 'Add place',
    full: `You already have ${MAX_PLACES} places: delete one to add another.`,
    discarded: 'Place not saved',
    back: 'Back',
    unlocated: (name: string) => `${name} has no location: the reminder won’t go off.`,
    locateIt: 'Locate',
  },
} as const
const RADIUS_MARKS = [MIN_RADIUS, 100, MAX_RADIUS] as const
const MAP_HEIGHT = 190
/** Alto del mapa en metros: el radio más grande cabe con aire alrededor. */
const mapSpan = (radius: number) => Math.max(160, radius * 3.2)

/**
 * Crear o editar un lugar. Uno nuevo empieza por dónde está (el buscador con el teclado, el mapa o la
 * ubicación actual) y, con eso, pide el nombre y se crea con el botón del pie; cerrar el panel lo
 * descarta (con "Volver" en el aviso). Uno existente guarda los cambios al cerrar: si el nombre quedó
 * vacío, conserva el que tenía.
 */
export function PlaceSheet({ request, onClose }: PlaceSheetProps) {
  const state = useAppState()
  const dispatch = useDispatch()
  const toast = useToast()
  const copy = useCopy(COPY)
  const openPlace = usePlaceEditor()
  const { toggle } = useTaskActions()
  // Se conserva la última petición para animar el cierre sin que cambie el contenido.
  const [shown, setShown] = useState<PlaceRequest | null>(request)
  const place = shown?.placeId ? (state.places.find((item) => item.id === shown.placeId) ?? null) : null
  const [draft, setDraft] = useState<Draft>({ name: '', aliases: [], location: null, radius: DEFAULT_RADIUS })
  const [query, setQuery] = useState('')
  const [confirming, setConfirming] = useState(false)
  const [locating, setLocating] = useState(false)
  // Con ubicación, lo que sirve para cambiarla va plegado tras una fila.
  const [changing, setChanging] = useState(false)
  const [aliasesOpen, setAliasesOpen] = useState(false)
  // Radio mientras se arrastra el deslizador: el círculo del mapa lo sigue en vivo.
  const [liveRadius, setLiveRadius] = useState<number | null>(null)
  const search = usePlaceSearch(query, request !== null)
  const radius = liveRadius ?? draft.radius
  const linked = place
    ? state.tasks.filter((task) => !task.done && task.reminders.some((reminder) => reminder.kind === 'place' && reminder.placeId === place.id))
    : []
  const isNew = !place
  const hasLocation = draft.location !== null
  const full = isNew && state.places.length >= MAX_PLACES

  useEffect(() => {
    if (!request) return
    setShown(request)
    const current = request.placeId ? state.places.find((item) => item.id === request.placeId) : undefined
    const name = current?.name ?? request.name ?? ''
    const location = current?.location ?? request.location ?? null
    setDraft({ name, aliases: current?.aliases ?? [], location, radius: current?.radius ?? DEFAULT_RADIUS })
    // Sin ubicación todavía, se busca directamente por el nombre.
    setQuery(location ? '' : name)
    setConfirming(false)
    setChanging(false)
    setAliasesOpen(false)
  }, [request]) // eslint-disable-line react-hooks/exhaustive-deps

  // Un lugar que ya no existe (se borró desde otro sitio) no deja un panel vacío abierto.
  useEffect(() => {
    if (request?.placeId && !state.places.some((item) => item.id === request.placeId)) onClose()
  }, [request, state.places, onClose])

  const update = (patch: Partial<Draft>) => setDraft((current) => ({ ...current, ...patch }))

  const warnUnlocated = (id: string, name: string) => {
    if (draft.location) return
    toast({ message: copy.unlocated(name), actionLabel: copy.locateIt, onAction: () => openPlace({ placeId: id }) })
  }

  /** Cerrar: uno existente guarda lo que haya; uno nuevo se descarta (con "Volver" por si no era eso). */
  const close = () => {
    if (!request) return onClose()
    if (place) {
      // Sin nombre se conserva el que tenía: borrarlo para reescribirlo no debe perder el resto.
      const wanted = cleanPlaceName(draft.name)
      const clash = wanted ? findPlace(state.places, wanted) : null
      const name = wanted && !(clash && clash.id !== place.id) ? wanted : place.name
      if (clash && clash.id !== place.id) toast({ message: copy.clash(wanted) })
      dispatch({ type: 'place/update', id: place.id, name, aliases: draft.aliases, location: draft.location, radius: draft.radius })
      request.onSaved?.(place.id)
      warnUnlocated(place.id, name)
    } else if (draft.name.trim() || draft.location) {
      const again: PlaceRequest = { ...request, name: draft.name, ...(draft.location ? { location: draft.location } : {}) }
      toast({ message: copy.discarded, actionLabel: copy.back, onAction: () => openPlace(again) })
    }
    onClose()
  }

  /** Solo desde el botón del pie. Un nombre que ya existe no pisa al otro lugar: se dice y se ofrece verlo. */
  const create = () => {
    const name = cleanPlaceName(draft.name)
    if (!request || !name || full) return
    const existing = findPlace(state.places, name)
    if (existing?.location) {
      toast({ message: copy.exists(name), actionLabel: copy.view, onAction: () => openPlace({ placeId: existing.id }) })
      return
    }
    // El que había sin ubicar (dictado) se completa con esto: los avisos casan por nombre.
    const id = existing?.id ?? createId()
    if (existing) {
      dispatch({ type: 'place/update', id, aliases: [...existing.aliases, ...draft.aliases], location: draft.location, radius: draft.radius })
    } else dispatch({ type: 'place/add', id, name, aliases: draft.aliases, location: draft.location, radius: draft.radius })
    haptic('success')
    request.onSaved?.(id)
    warnUnlocated(id, name)
    onClose()
  }

  const pickCurrentLocation = async () => {
    setLocating(true)
    try {
      const { TasksNative } = await import('../../lib/platform/native')
      const { lat, lng } = await TasksNative.currentPosition()
      update({ location: { lat, lng, address: '' } })
      setQuery('')
      setChanging(false)
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

  /** El mapa a pantalla completa: se arrastra bajo la chincheta o se toca el sitio (o un comercio). */
  const mapOpen = useRef(false)
  const chooseOnMap = async () => {
    // Un doble toque no abre dos mapas.
    if (mapOpen.current) return
    mapOpen.current = true
    const others = state.places.flatMap((item) =>
      item.id !== place?.id && item.location ? [{ name: item.name, lat: item.location.lat, lng: item.location.lng, radius: item.radius }] : [],
    )
    try {
      const picked = await pickOnMap({
        title: cleanPlaceName(draft.name) || copy.newPlace,
        confirm: copy.useSpot,
        cancel: copy.close,
        locate: copy.locate,
        ...(draft.location ? { center: { lat: draft.location.lat, lng: draft.location.lng } } : {}),
        radius: draft.radius,
        places: others,
      })
      if (!picked) return
      // Un comercio tocado en el mapa da también el nombre, si aún no tiene.
      setDraft((current) => ({ ...current, location: picked.location, name: current.name.trim() ? current.name : (picked.name ?? '') }))
      setQuery('')
      setChanging(false)
    } catch {
      toast({ message: copy.mapFailed })
    } finally {
      mapOpen.current = false
    }
  }

  /** Dos toques: el segundo dice cuántos avisos se lleva. Con "Deshacer", que devuelve el lugar y los avisos. */
  const remove = () => {
    if (!place) return
    if (!confirming) {
      setConfirming(true)
      setTimeout(() => setConfirming(false), CONFIRM_MS)
      return
    }
    const reminders: { taskId: string; reminder: Reminder }[] = state.tasks.flatMap((task) =>
      task.reminders.flatMap((reminder) => (reminder.kind === 'place' && reminder.placeId === place.id ? [{ taskId: task.id, reminder }] : [])),
    )
    dispatch({ type: 'place/remove', id: place.id })
    haptic('warning')
    onClose()
    toast({
      message: copy.removed(place.name),
      actionLabel: copy.undo,
      onAction: () => dispatch({ type: 'place/restore', place, reminders }),
    })
  }

  const showPicker = !hasLocation || changing
  const noResults = query.trim().length >= MIN_QUERY && !search.searching && !search.failed && search.results.length === 0

  const footer = isNew ? (
    <button type="button" className="sheet__primary" disabled={!cleanPlaceName(draft.name) || full} onClick={create}>
      {copy.add}
    </button>
  ) : undefined

  return (
    <Sheet open={request !== null} onClose={close} title={place ? copy.place : copy.newPlace} footer={footer}>
      {full && <p className="sheet__note">{copy.full}</p>}

      {/* El nombre va primero en cuanto hay dónde ponerlo; uno nuevo empieza por dónde está. */}
      {(hasLocation || !isNew) && (
        <input
          className="sheet__input"
          value={draft.name}
          placeholder={copy.name}
          aria-label={copy.placeName}
          autoComplete="off"
          enterKeyHint="done"
          autoFocus={isNew && !draft.name.trim()}
          onChange={(event) => update({ name: event.target.value })}
        />
      )}

      {draft.location && (
        <>
          <button type="button" className="place-sheet__map" aria-label={copy.openMap} onClick={() => void chooseOnMap()}>
            <MapSnapshot
              points={[draft.location]}
              center={draft.location}
              span={mapSpan(draft.radius)}
              radius={radius}
              height={MAP_HEIGHT}
              renderPin={() => <span className="place-sheet__center" />}
            />
            <span className="map__expand" aria-hidden="true">
              <IconExpand size={15} />
            </span>
          </button>
          <p className="place-current">
            <IconPin size={16} />
            <span>{draft.location.address || copy.saved}</span>
          </p>
          {!changing && (
            <button type="button" className="sheet__row" aria-expanded={false} onClick={() => setChanging(true)}>
              <IconMap size={18} />
              <span className="place-sheet__grow">{copy.change}</span>
              <IconChevronRight size={16} />
            </button>
          )}
        </>
      )}

      {showPicker && (
        <>
          {!hasLocation && <p className="sheet__title">{copy.where}</p>}
          <label className="place-search">
            <IconSearch size={16} />
            <input
              value={query}
              placeholder={copy.search}
              aria-label={copy.search}
              enterKeyHint="search"
              autoComplete="off"
              autoFocus={isNew && !hasLocation}
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
                      setChanging(false)
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
          {search.searching && <p className="sheet__note">{copy.searching}</p>}
          {noResults && <p className="sheet__note">{copy.noResults}</p>}
          {search.failed && <p className="sheet__note">{copy.searchFailed}</p>}

          <button type="button" className="sheet__row" onClick={() => void chooseOnMap()}>
            <IconMap size={18} />
            {copy.onMap}
          </button>
          <button type="button" className="sheet__row" disabled={locating} onClick={() => void pickCurrentLocation()}>
            <IconLocate size={18} />
            {copy.current}
          </button>
        </>
      )}

      {hasLocation && (
        <>
          <p className="sheet__title">{copy.radius}</p>
          <Slider
            value={draft.radius}
            stops={RADIUS_STOPS}
            label={copy.radius}
            format={(value) => formatDistance(value)}
            marks={RADIUS_MARKS}
            onInput={setLiveRadius}
            onChange={(value) => {
              setLiveRadius(null)
              update({ radius: value })
            }}
          />
          <p className="sheet__note">{copy.radiusNote}</p>
        </>
      )}

      {place && linked.length > 0 && (
        <>
          <p className="sheet__title">{copy.linked}</p>
          <div className="place-tasks">
            {linked.map((task) => (
              <TaskRow
                key={task.id}
                task={task}
                onToggle={() => toggle(task.id)}
                onOpen={() => {
                  close()
                  requestOpenTask(task.id)
                }}
              />
            ))}
          </div>
        </>
      )}

      {place &&
        (aliasesOpen ? (
          <PlaceAliases name={draft.name} aliases={draft.aliases} placeId={place.id} onChange={(aliases) => update({ aliases })} />
        ) : (
          <button type="button" className="sheet__row sheet__fold" aria-expanded={false} onClick={() => setAliasesOpen(true)}>
            <span className="sheet__fold-label">{copy.aliases}</span>
            <span className="sheet__fold-value place-sheet__aliases">{draft.aliases.length ? draft.aliases.join(', ') : copy.none}</span>
            <IconChevronRight size={16} />
          </button>
        ))}

      {place && (
        <button type="button" className="sheet__row sheet__row--danger" onClick={remove}>
          <IconTrash size={18} />
          {confirming ? (linked.length ? copy.confirmWith(linked.length) : copy.confirm) : copy.remove}
        </button>
      )}
    </Sheet>
  )
}
