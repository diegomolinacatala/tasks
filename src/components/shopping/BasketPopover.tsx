import { useEffect, useMemo, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { createPortal } from 'react-dom'
import { plural } from '../../lib/i18n'
import { acquireModal, releaseModal } from '../../lib/modal'
import { isNative } from '../../lib/platform'
import { haptic } from '../../lib/platform/feedback'
import { sortedItems, suggestions } from '../../lib/shopping'
import { parseShoppingText } from '../../lib/shoppingParse'
import { useCopy } from '../../state/LanguageProvider'
import { useAppState, useDispatch } from '../../state/StoreProvider'
import type { ShoppingItem } from '../../types'
import { SwipeRow } from '../task/SwipeRow'
import { IconArrive, IconBasket, IconCheck, IconChevronDown, IconChevronRight, IconPlus } from '../ui/Icons'
import { useToast } from '../ui/Toast'
import './basket.css'

/** Lo que dura el fundido de cierre (`--dur-2`): hasta entonces no se desmonta. */
const EXIT_MS = 220
/** Habituales a la vista: más abruman. */
const MAX_CHIPS = 6
const MAX_INPUT = 200

const COPY = {
  es: {
    title: 'Cesta',
    close: 'Cerrar la cesta',
    label: (count: number) => (count ? `Cesta, ${plural(count, 'pendiente', 'pendientes')}` : 'Cesta'),
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
  },
  en: {
    title: 'Basket',
    close: 'Close the basket',
    label: (count: number) => (count ? `Basket, ${plural(count, 'pending', 'pending')}` : 'Basket'),
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
  },
} as const

interface BasketPopoverProps {
  open: boolean
  onClose: () => void
}

/**
 * La cesta: la lista de la compra, en un popover que se despliega desde el icono de la cabecera sin
 * ocupar la pantalla. Arriba, el campo para añadir ("pan, leche y huevos" son tres; "2 kg de arroz"
 * lleva cantidad) y las habituales (lo más comprado otras veces, de un toque); después lo pendiente,
 * que se tacha tocándolo o deslizando a la derecha (a la izquierda se quita, con deshacer); lo
 * comprado se pliega en una línea, con "Vaciar" dentro. En el iPhone, al pie, la tienda en la que
 * avisa al llegar con lo pendiente. Como un panel: la app de debajo queda inerte y el velo, el
 * icono o Escape la cierran.
 */
export function BasketPopover({ open, onClose }: BasketPopoverProps) {
  const state = useAppState()
  const dispatch = useDispatch()
  const toast = useToast()
  const copy = useCopy(COPY)
  const [mounted, setMounted] = useState(open)
  const [shown, setShown] = useState(false)
  const [value, setValue] = useState('')
  const [boughtOpen, setBoughtOpen] = useState(false)
  const [placeOpen, setPlaceOpen] = useState(false)
  // Desde cuándo está abierta: lo comprado desde entonces se queda a la vista, tachado, al final de lo
  // pendiente (se ve el círculo llenarse y un toque de más se arregla con otro); solo lo de antes se pliega.
  const [openedAt, setOpenedAt] = useState(() => Date.now())
  const input = useRef<HTMLInputElement>(null)
  const panel = useRef<HTMLDivElement>(null)

  const { items, history, placeId } = state.shopping
  const { pending, bought } = useMemo(() => sortedItems(items), [items])
  const justBought = useMemo(() => bought.filter((item) => (item.doneAt ?? 0) >= openedAt).reverse(), [bought, openedAt])
  const earlier = useMemo(() => bought.filter((item) => (item.doneAt ?? 0) < openedAt), [bought, openedAt])
  const usual = useMemo(() => suggestions({ items, history }, MAX_CHIPS), [items, history])
  const located = state.places.filter((place) => place.location)
  const place = located.find((item) => item.id === placeId)

  useEffect(() => {
    if (open) {
      setMounted(true)
      setOpenedAt(Date.now())
      const frame = requestAnimationFrame(() => setShown(true))
      return () => cancelAnimationFrame(frame)
    }
    setShown(false)
    const timer = setTimeout(() => {
      setMounted(false)
      setBoughtOpen(false)
      setPlaceOpen(false)
    }, EXIT_MS)
    return () => clearTimeout(timer)
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    // Un popover deja el pie libre: el toast se queda abajo, donde siempre.
    acquireModal('popover')
    const frame = requestAnimationFrame(() => panel.current?.focus({ preventScroll: true }))
    return () => {
      cancelAnimationFrame(frame)
      document.removeEventListener('keydown', onKey)
      releaseModal()
    }
  }, [open, onClose])

  if (!mounted) return null

  const add = (text: string) => {
    const drafts = parseShoppingText(text)
    if (!drafts.length) return
    const now = Date.now()
    drafts.forEach((draft) => dispatch({ type: 'shopping/add', name: draft.name, qty: draft.qty, now }))
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
    dispatch({ type: 'shopping/toggle', id: item.id, now: Date.now() })
  }

  const remove = (item: ShoppingItem) => {
    haptic('warning')
    dispatch({ type: 'shopping/remove', id: item.id })
    toast({ message: copy.removed(item.name), actionLabel: copy.undo, onAction: () => dispatch({ type: 'shopping/restore', item }) })
  }

  const clearBought = () => {
    const gone = bought
    haptic('warning')
    dispatch({ type: 'shopping/clearDone' })
    setBoughtOpen(false)
    toast({
      message: copy.cleared(gone.length),
      actionLabel: copy.undo,
      onAction: () => gone.forEach((item) => dispatch({ type: 'shopping/restore', item })),
    })
  }

  const choosePlace = (id: string | null) => {
    haptic('selection')
    dispatch({ type: 'shopping/place', placeId: id })
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

  const showPlace = isNative && located.length > 0 && pending.length > 0

  return createPortal(
    <div className={`basket ${shown ? 'is-open' : ''}`} role="dialog" aria-modal="true" aria-label={copy.title}>
      <button type="button" className="basket__scrim" aria-label={copy.close} onClick={onClose} />
      {/* El icono, en su sitio y encendido: tocarlo pliega la cesta; el pico la une a él. */}
      <button type="button" className="basket__anchor" aria-label={copy.close} aria-expanded="true" onClick={onClose}>
        <IconBasket size={21} />
      </button>
      <span className="basket__beak" aria-hidden="true" />
      <div ref={panel} className="basket__panel" tabIndex={-1}>
        <header className="basket__head">
          <IconBasket size={16} />
          <span className="basket__title">{copy.title}</span>
          {pending.length > 0 && <span className="basket__count">{pending.length}</span>}
        </header>
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
        <div className="basket__body">
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
      </div>
    </div>,
    document.body,
  )
}
