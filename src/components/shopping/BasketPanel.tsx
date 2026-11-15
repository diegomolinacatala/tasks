import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { basketShopping, sortedBaskets } from '../../lib/baskets'
import { basketTab, onBasketTab, setBasketTab } from '../../lib/basketTab'
import { showsPlaces } from '../../lib/platform'
import { haptic } from '../../lib/platform/feedback'
import { sortedItems, suggestions } from '../../lib/shopping'
import { parseShoppingText } from '../../lib/shoppingParse'
import { useCopy } from '../../state/LanguageProvider'
import { useAppState, useDispatch } from '../../state/StoreProvider'
import type { ShoppingItem } from '../../types'
import { SwipeRow } from '../task/SwipeRow'
import { IconArrive, IconBasket, IconCheck, IconChevronDown, IconChevronRight, IconPlus } from '../ui/Icons'
import { useToast } from '../ui/Toast'
import { useSync } from '../sync/SyncProvider'
import { BasketTabs, IconPeople } from './BasketTabs'
import { SHARE_EVENT } from './shareEvent'

const BasketShareSheet = lazy(() => import('./BasketShareSheet').then((module) => ({ default: module.BasketShareSheet })))

/** Habituales a la vista: más abruman. */
const MAX_CHIPS = 6
const MAX_INPUT = 200

const COPY = {
  es: {
    title: 'Cesta',
    add: 'Añadir…',
    addButton: 'Añadir a la cesta',
    usual: 'Habituales',
    addUsual: (name: string) => `Añadir ${name}`,
    empty: 'Nada que comprar.',
    bought: (count: number) => `En la cesta · ${count}`,
    clear: (count: number) => (count === 1 ? 'Vaciar la cesta' : `Vaciar la cesta (${count})`),
    cleared: (count: number) => (count === 1 ? '1 comprada fuera de la cesta' : `${count} compradas fuera de la cesta`),
    removed: (name: string) => `${name} fuera de la lista`,
    undo: 'Deshacer',
    bought1: (name: string) => `Comprado: ${name}`,
    pending1: (name: string) => `Por comprar: ${name}`,
    atPlace: (name: string) => `Al llegar a ${name}`,
    choosePlace: 'Avisar al llegar a…',
    noAlert: 'Sin aviso',
    placeTitle: 'Avisar con lo pendiente al llegar a',
    share: 'Compartir la cesta',
    offline: 'Sin conexión: se envía al volver',
  },
  en: {
    title: 'Basket',
    add: 'Add…',
    addButton: 'Add to the basket',
    usual: 'Usual',
    addUsual: (name: string) => `Add ${name}`,
    empty: 'Nothing to buy.',
    bought: (count: number) => `In the basket · ${count}`,
    clear: (count: number) => (count === 1 ? 'Empty the basket' : `Empty the basket (${count})`),
    cleared: (count: number) => (count === 1 ? '1 bought item cleared' : `${count} bought items cleared`),
    removed: (name: string) => `${name} removed`,
    undo: 'Undo',
    bought1: (name: string) => `Bought: ${name}`,
    pending1: (name: string) => `To buy: ${name}`,
    atPlace: (name: string) => `Arriving at ${name}`,
    choosePlace: 'Remind me when I arrive at…',
    noAlert: 'No reminder',
    placeTitle: 'Remind me of what’s left when I arrive at',
    share: 'Share the basket',
    offline: 'Offline: it’ll send when you’re back',
  },
} as const

/** La cesta que se ve: la que diga la pestaña, si sigue existiendo; si no, la propia. */
function useBasketTab(): [string | null, (tab: string | null) => void] {
  const [tab, setTab] = useState(basketTab)
  useEffect(() => onBasketTab(setTab), [])
  return [tab, setBasketTab]
}

interface BasketPanelProps {
  /** Desde cuándo está a la vista: lo comprado desde entonces se queda, tachado, al final de lo pendiente. */
  openedAt: number
  /** En una columna del escritorio (sin velo ni icono): el campo no se enfoca solo y nada se cierra. */
  inline?: boolean
}

/**
 * El contenido de la cesta (`BasketPopover` en el móvil, una columna en el escritorio): las pestañas de
 * cada cesta (la tuya y las compartidas), el campo para añadir ("pan, leche y huevos" son tres), las
 * habituales, lo pendiente y lo comprado plegado. En el iPhone, al pie, la tienda en la que avisa.
 */
export function BasketPanel({ openedAt, inline = false }: BasketPanelProps) {
  const state = useAppState()
  const dispatch = useDispatch()
  const toast = useToast()
  const copy = useCopy(COPY)
  const sync = useSync()
  const [tab, setTab] = useBasketTab()
  const [value, setValue] = useState('')
  const [boughtOpen, setBoughtOpen] = useState(false)
  const [placeOpen, setPlaceOpen] = useState(false)
  const [sharing, setSharing] = useState(false)
  const input = useRef<HTMLInputElement>(null)

  const baskets = useMemo(() => sortedBaskets(state.baskets), [state.baskets])
  const shared = baskets.find((basket) => basket.id === tab) ?? null
  const basket = shared?.id
  const { items, history, placeId } = shared ? basketShopping(shared) : state.shopping
  const { pending, bought } = useMemo(() => sortedItems(items), [items])
  const justBought = useMemo(() => bought.filter((item) => (item.doneAt ?? 0) >= openedAt).reverse(), [bought, openedAt])
  const earlier = useMemo(() => bought.filter((item) => (item.doneAt ?? 0) < openedAt), [bought, openedAt])
  const usual = useMemo(() => suggestions({ items, history }, MAX_CHIPS), [items, history])
  const located = state.places.filter((place) => place.location)
  const place = located.find((item) => item.id === placeId)
  const offline = shared && sync.basketStatus[shared.id] === 'offline'

  useEffect(() => {
    setBoughtOpen(false)
    setPlaceOpen(false)
  }, [basket])

  // Una cesta recién creada abre su panel de invitar en cuanto se ve (el aviso puede llegar antes que la
  // pestaña nueva: entonces espera a que se vea).
  const pendingShare = useRef<string | null>(null)
  useEffect(() => {
    if (basket && pendingShare.current === basket) {
      pendingShare.current = null
      setSharing(true)
    }
    const onShare = (event: Event) => {
      if (!(event instanceof CustomEvent)) return
      if (event.detail === basket) setSharing(true)
      else pendingShare.current = typeof event.detail === 'string' ? event.detail : null
    }
    window.addEventListener(SHARE_EVENT, onShare)
    return () => window.removeEventListener(SHARE_EVENT, onShare)
  }, [basket])

  const add = (text: string) => {
    const drafts = parseShoppingText(text)
    if (!drafts.length) return
    const now = Date.now()
    drafts.forEach((draft) => dispatch({ type: 'shopping/add', name: draft.name, qty: draft.qty, now, basket }))
    haptic('selection')
  }

  const submit = (event?: FormEvent) => {
    event?.preventDefault()
    if (!value.trim()) return
    add(value)
    setValue('')
    // La barra sigue lista para la siguiente.
    input.current?.focus()
  }

  /** El +: con algo escrito lo añade; vacío, pide el teclado (abrir la cesta para mirar no lo sube). */
  const onPlus = () => {
    if (value.trim()) submit()
    else input.current?.focus()
  }

  const toggle = (item: ShoppingItem) => {
    haptic(item.done ? 'tap' : 'success')
    dispatch({ type: 'shopping/toggle', id: item.id, now: Date.now(), basket })
  }

  const remove = (item: ShoppingItem) => {
    haptic('warning')
    dispatch({ type: 'shopping/remove', id: item.id, basket })
    toast({ message: copy.removed(item.name), actionLabel: copy.undo, onAction: () => dispatch({ type: 'shopping/restore', item, basket }) })
  }

  const clearBought = () => {
    const gone = bought
    haptic('warning')
    dispatch({ type: 'shopping/clearDone', basket })
    setBoughtOpen(false)
    toast({
      message: copy.cleared(gone.length),
      actionLabel: copy.undo,
      onAction: () => gone.forEach((item) => dispatch({ type: 'shopping/restore', item, basket })),
    })
  }

  const choosePlace = (id: string | null) => {
    haptic('selection')
    dispatch({ type: 'shopping/place', placeId: id, basket })
    setPlaceOpen(false)
  }

  const row = (item: ShoppingItem) => (
    <SwipeRow key={item.id} className="basket__swipe" flip={`basket:${item.id}`} done={item.done} onRight={() => toggle(item)} onLeft={() => remove(item)}>
      <button
        type="button"
        className={`row basket__item ${item.done ? 'is-done' : ''}`}
        aria-pressed={item.done}
        aria-label={item.done ? copy.pending1(item.name) : copy.bought1(item.name)}
        onClick={() => toggle(item)}
      >
        <span className="row__check" aria-hidden="true">
          <IconCheck size={13} strokeWidth={2.5} />
        </span>
        <span className="row__main">
          <span className="row__title">
            <span className="row__text">{item.name}</span>
          </span>
          {item.qty && <span className="row__meta">{item.qty}</span>}
        </span>
      </button>
    </SwipeRow>
  )

  // Donde hay lugares (el iPhone; en local y en las capturas, para verlo).
  const showPlace = showsPlaces && located.length > 0 && pending.length > 0
  const showTabs = sync.available || baskets.length > 0

  return (
    <>
      <header className="basket__head">
        <IconBasket size={16} />
        <span className="basket__title">{shared ? shared.name : copy.title}</span>
        {pending.length > 0 && <span className="basket__count">{pending.length}</span>}
        {shared && (
          <button type="button" className="basket__share" aria-label={copy.share} onClick={() => setSharing(true)}>
            <IconPeople size={18} />
          </button>
        )}
      </header>
      {showTabs && <BasketTabs baskets={baskets} tab={shared ? shared.id : null} onTab={setTab} pendingMine={sortedItems(state.shopping.items).pending.length} />}
      {offline && <p className="basket__offline">{copy.offline}</p>}
      <form className="basket__add" onSubmit={submit}>
        <input
          ref={input}
          className="basket__input"
          value={value}
          placeholder={copy.add}
          aria-label={copy.add}
          enterKeyHint="done"
          autoComplete="off"
          autoCapitalize="sentences"
          maxLength={MAX_INPUT}
          onChange={(event) => setValue(event.target.value)}
        />
        <button type="button" className="basket__plus" aria-label={copy.addButton} onClick={onPlus}>
          <IconPlus size={18} strokeWidth={2.2} />
        </button>
      </form>
      <div className={`basket__body ${inline ? 'is-inline' : ''}`}>
        {usual.length > 0 && (
          <div className="basket__usual" role="group" aria-label={copy.usual}>
            {usual.map((memory) => (
              <button key={memory.name} type="button" className="chip chip--option basket__chip" aria-label={copy.addUsual(memory.name)} onClick={() => add(memory.name)}>
                <IconPlus size={11} strokeWidth={2.2} />
                {memory.name}
              </button>
            ))}
          </div>
        )}
        {pending.length > 0 || justBought.length > 0 ? (
          <ul className="basket__list">
            {pending.map(row)}
            {justBought.map(row)}
          </ul>
        ) : (
          <p className="basket__empty">{copy.empty}</p>
        )}
        {earlier.length > 0 && (
          <>
            <button type="button" className={`basket__fold ${boughtOpen ? 'is-open' : ''}`} aria-expanded={boughtOpen} onClick={() => setBoughtOpen((current) => !current)}>
              <IconChevronDown size={14} />
              {copy.bought(earlier.length)}
            </button>
            {boughtOpen && <ul className="basket__list basket__list--bought">{earlier.map(row)}</ul>}
          </>
        )}
        {bought.length > 0 && (boughtOpen || !earlier.length) && (
          <button type="button" className="basket__clear" onClick={clearBought}>
            {copy.clear(bought.length)}
          </button>
        )}
      </div>
      {showPlace && (
        <footer className="basket__foot">
          <button type="button" className="basket__place" aria-expanded={placeOpen} onClick={() => setPlaceOpen((current) => !current)}>
            <IconArrive size={15} />
            <span className="basket__place-label">{place ? copy.atPlace(place.name) : copy.choosePlace}</span>
            <IconChevronRight size={14} />
          </button>
          {placeOpen && (
            <div className="sheet__chips basket__places" role="radiogroup" aria-label={copy.placeTitle}>
              <button type="button" role="radio" aria-checked={!place} className={`chip ${!place ? 'is-active' : ''}`} onClick={() => choosePlace(null)}>
                {copy.noAlert}
              </button>
              {located.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  role="radio"
                  aria-checked={item.id === place?.id}
                  className={`chip ${item.id === place?.id ? 'is-active' : ''}`}
                  onClick={() => choosePlace(item.id)}
                >
                  {item.name}
                </button>
              ))}
            </div>
          )}
        </footer>
      )}
      {sharing && shared && (
        <Suspense fallback={null}>
          <BasketShareSheet basket={shared} onClose={() => setSharing(false)} />
        </Suspense>
      )}
    </>
  )
}
