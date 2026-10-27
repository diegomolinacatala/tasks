import { useEffect, useMemo, useRef, useState } from 'react'
import { haptic } from '../../lib/platform/feedback'
import { showsPlaces } from '../../lib/platform'
import { parseShoppingText } from '../../lib/shoppingParse'
import { useCopy } from '../../state/LanguageProvider'
import { IconBasket, IconCheck, IconPin, IconPlus } from '../ui/Icons'
import { reducedMotion } from './motion'
import '../task/task.css'
import '../ui/sheet.css'

const COPY = {
  es: {
    title: 'La cesta',
    typed: 'pan, leche y 2 kg de arroz',
    placeholder: 'Añadir…',
    usual: ['Café', 'Huevos', 'Aceite'],
    place: 'Avisar al llegar a Mercadona',
    bought: (count: number) => `En la cesta · ${count}`,
    label: 'La lista de la compra: se escribe de una vez, cada cosa es una fila y se tachan al comprarlas.',
  },
  en: {
    title: 'Basket',
    typed: 'bread, milk and 2 kg of rice',
    placeholder: 'Add…',
    usual: ['Coffee', 'Eggs', 'Olive oil'],
    place: 'Remind me at the supermarket',
    bought: (count: number) => `In the basket · ${count}`,
    label: 'The shopping list: write it in one go, each thing becomes a row and you check them off as you buy them.',
  },
} as const

const TYPE_MS = 48
/** Lo que se queda escrito antes de pasar a filas. */
const HOLD_MS = 700
const START_MS = 500

interface Item {
  id: number
  name: string
  qty: string | null
  done: boolean
}

let ids = 0

/**
 * La cesta, con el dedo: el campo se escribe solo («pan, leche y 2 kg de arroz») y, al acabar, lo
 * entendido de verdad (`parseShoppingText`) baja a filas con su cantidad. Tocar una la compra (se tacha
 * y baja al final); las habituales se añaden con un toque; en el iPhone, abajo, el aviso al llegar a la
 * tienda. Con el movimiento reducido las filas están ya.
 */
export function BasketScene() {
  const copy = useCopy(COPY)
  const still = useMemo(reducedMotion, [])
  const [typed, setTyped] = useState(still ? copy.typed.length : 0)
  const [started, setStarted] = useState(still)
  const [items, setItems] = useState<Item[]>(() =>
    still ? parseShoppingText(copy.typed).map((draft) => ({ id: ++ids, ...draft, done: false })) : [],
  )
  const [usual, setUsual] = useState<readonly string[]>(copy.usual)
  const timer = useRef<number | undefined>(undefined)

  useEffect(() => {
    // Con las filas ya puestas, el campo queda vacío para lo siguiente: no se vuelve a escribir. Cada
    // vuelta limpia el temporizador de la anterior: si se toca una habitual durante la espera, lo que
    // iba a pasar a filas no pisa lo añadido.
    if (still || items.length) return
    if (!started) timer.current = window.setTimeout(() => setStarted(true), START_MS)
    else if (typed < copy.typed.length) timer.current = window.setTimeout(() => setTyped((count) => count + 1), TYPE_MS + ((typed * 7) % 30))
    else
      timer.current = window.setTimeout(() => {
        setItems((current) => [...current, ...parseShoppingText(copy.typed).map((draft) => ({ id: ++ids, ...draft, done: false }))])
        setTyped(0)
        haptic('tap')
      }, HOLD_MS)
    return () => window.clearTimeout(timer.current)
  }, [still, started, typed, items.length, copy.typed])

  const toggle = (id: number) => {
    const item = items.find((entry) => entry.id === id)
    haptic(item?.done ? 'tap' : 'success')
    setItems((current) => current.map((entry) => (entry.id === id ? { ...entry, done: !entry.done } : entry)))
  }

  const addUsual = (name: string) => {
    haptic('selection')
    setUsual((current) => current.filter((entry) => entry !== name))
    setItems((current) => [...current, { id: ++ids, name, qty: null, done: false }])
  }

  const pending = items.filter((item) => !item.done)
  const bought = items.filter((item) => item.done)
  const text = copy.typed.slice(0, typed)

  return (
    <div className="scene scene--basket">
      <p className="sr-only">{copy.label}</p>
      <div className="scene__basket-icon" aria-hidden="true">
        <IconBasket size={20} />
        {pending.length > 0 && <span className="app__basket-count">{pending.length}</span>}
      </div>
      <div className="scene__basket">
        <span className="scene__basket-beak" />
        <header className="scene__basket-head" aria-hidden="true">
          <IconBasket size={15} />
          <span className="scene__basket-title">{copy.title}</span>
          {pending.length > 0 && <span className="scene__basket-count">{pending.length}</span>}
        </header>
        <div className="scene__basket-add" aria-hidden="true">
          <span className={`scene__basket-input ${text ? '' : 'is-empty'}`}>
            {/* Como el campo de verdad: si la frase no cabe, se ve el final, donde está el cursor. */}
            <span>
              {text || copy.placeholder}
              {!still && started && !items.length && <i className="scene__caret" />}
            </span>
          </span>
          <span className="scene__basket-plus">
            <IconPlus size={18} />
          </span>
        </div>
        {usual.length > 0 && (
          <div className="scene__basket-usual">
            {usual.map((name) => (
              <button key={name} type="button" className="chip chip--option scene__basket-chip" onClick={() => addUsual(name)}>
                <IconPlus size={11} strokeWidth={2.4} />
                {name}
              </button>
            ))}
          </div>
        )}
        <ul className="scene__basket-list">
          {[...pending, ...bought].map((item) => (
            <li key={item.id} className="scene__basket-row">
              <button type="button" className={`row scene__basket-item ${item.done ? 'is-done' : ''}`} aria-pressed={item.done} onClick={() => toggle(item.id)}>
                <span className="row__check" aria-hidden="true">
                  <IconCheck size={13} strokeWidth={2.5} />
                </span>
                <span className="row__title">
                  <span className="row__text">{item.name}</span>
                </span>
                {item.qty && <span className="scene__basket-qty">{item.qty}</span>}
              </button>
            </li>
          ))}
        </ul>
        {bought.length > 0 && <p className="scene__basket-fold">{copy.bought(bought.length)}</p>}
        {showsPlaces && (
          <footer className="scene__basket-foot">
            <IconPin size={13} strokeWidth={2.2} />
            {copy.place}
          </footer>
        )}
      </div>
    </div>
  )
}
