import { useEffect, useMemo, useState } from 'react'
import { haptic } from '../../lib/platform/feedback'
import { useCopy } from '../../state/LanguageProvider'
import { IconBasket, IconPlus } from '../ui/Icons'
import { MiniList, useFlash } from './MiniList'
import type { MiniItem } from './MiniList'
import { reducedMotion } from './motion'
import '../shopping/basket.css'
import '../ui/sheet.css'
import './sync-plates.css'

const COPY = {
  es: {
    mine: 'Mía',
    flat: 'Piso',
    family: 'Familia',
    you: 'Tú',
    yourPhone: 'Tu móvil',
    friendPhone: 'El móvil de Ibán',
    friend: 'Ibán',
    joiner: 'Sarita',
    invite: 'Invitar',
    members: 'Miembros',
    typing: 'Papel higiénico',
    add: 'Añadir…',
    items: ['Leche', 'Huevos', 'Pasta'],
    label:
      'Dos móviles con la misma cesta compartida, «Piso»: lo que se tacha en uno se tacha en el otro y lo que añade uno le llega al otro. «Invitar» suma a alguien más.',
  },
  en: {
    mine: 'Mine',
    flat: 'Flat',
    family: 'Family',
    you: 'You',
    yourPhone: 'Your phone',
    friendPhone: 'Ibán’s phone',
    friend: 'Ibán',
    joiner: 'Sarita',
    invite: 'Invite',
    members: 'Members',
    typing: 'Toilet paper',
    add: 'Add…',
    items: ['Milk', 'Eggs', 'Pasta'],
    label:
      'Two phones with the same shared basket, “Flat”: what one ticks off is ticked off on the other, and what one adds reaches the other. “Invite” brings in someone else.',
  },
} as const

type Side = 'you' | 'friend'

const TYPE_START_MS = 1300
const TYPE_MS = 60

/**
 * Una cesta compartida, con el dedo: dos móviles con «Piso» abierta. Tachar en uno se tacha en el otro
 * (y se ilumina), el de Ibán escribe algo que te llega solo, e «Invitar» suma a Sarita. Lo que se añade
 * no lleva nombre, como en la app: los nombres solo están en la lista de miembros.
 */
export function SharedScene() {
  const copy = useCopy(COPY)
  const still = useMemo(reducedMotion, [])
  const [items, setItems] = useState<MiniItem[]>(() => {
    const base = copy.items.map((title, index) => ({ id: index + 1, title, done: false }))
    return still ? [...base, { id: 100, title: copy.typing, done: false }] : base
  })
  const [typed, setTyped] = useState(still ? -1 : 0)
  const [members, setMembers] = useState<readonly string[]>([copy.you, copy.friend])
  const [youFlash, flashYou] = useFlash()
  const [friendFlash, flashFriend] = useFlash()

  // El móvil de Ibán escribe y te llega. Una vez (`typed` -1 = hecho).
  useEffect(() => {
    if (typed < 0) return
    const wait = typed === 0 ? TYPE_START_MS : typed < copy.typing.length ? TYPE_MS + ((typed * 7) % 30) : 450
    const id = window.setTimeout(() => {
      if (typed < copy.typing.length) {
        setTyped((count) => count + 1)
        return
      }
      setItems((current) => [...current, { id: 100, title: copy.typing, done: false }])
      setTyped(-1)
      flashYou(100)
      haptic('tap')
    }, wait)
    return () => window.clearTimeout(id)
  }, [typed, copy.typing, flashYou])

  const toggleFrom = (side: Side) => (id: number) => {
    const item = items.find((entry) => entry.id === id)
    haptic(item?.done ? 'tap' : 'success')
    setItems((current) => current.map((entry) => (entry.id === id ? { ...entry, done: !entry.done } : entry)))
    if (side === 'you') flashFriend(id)
    else flashYou(id)
  }

  const invite = () => {
    if (members.includes(copy.joiner)) return
    haptic('success')
    setMembers((current) => [...current, copy.joiner])
  }

  const pending = items.filter((item) => !item.done).length
  const typing = typed > 0 ? copy.typing.slice(0, typed) : ''
  const joined = members.includes(copy.joiner)

  const phone = (side: Side) => (
    <figure className={`scene__mini-phone scene__mini-phone--${side}`}>
      <div className="scene__phone-screen">
        <p className="scene__device-head">
          <IconBasket size={11} />
          {copy.flat}
          {pending > 0 && <span className="scene__device-count">{pending}</span>}
        </p>
        <MiniList
          label={side === 'you' ? copy.yourPhone : copy.friendPhone}
          items={items}
          flash={side === 'you' ? youFlash : friendFlash}
          onToggle={toggleFrom(side)}
          compact
        />
        <p className={`scene__mini-add ${side === 'friend' && typing ? '' : 'is-empty'}`} aria-hidden="true">
          {side === 'friend' && typing ? typing : copy.add}
          {side === 'friend' && typed > 0 && <i className="scene__caret" />}
        </p>
      </div>
      <figcaption>{side === 'you' ? copy.you : copy.friend}</figcaption>
    </figure>
  )

  return (
    <div className="scene scene--shared">
      <p className="sr-only">{copy.label}</p>
      <div className="basket-tabs scene__shared-tabs" aria-hidden="true">
        <span className="basket-tab">
          <span className="basket-tab__label">{copy.mine}</span>
          <span className="basket-tab__count">2</span>
        </span>
        <span className="basket-tab is-active">
          <span className="basket-tab__label">{copy.flat}</span>
          {pending > 0 && <span className="basket-tab__count">{pending}</span>}
        </span>
        <span className="basket-tab">
          <span className="basket-tab__label">{copy.family}</span>
        </span>
      </div>
      <div className="scene__phones">
        {phone('you')}
        {phone('friend')}
      </div>
      <footer className="scene__members">
        <ul aria-label={copy.members}>
          {members.map((name) => (
            <li key={name} className={name === copy.joiner ? 'is-new' : ''}>
              <span aria-hidden="true">{name.slice(0, 1)}</span>
              {name}
            </li>
          ))}
        </ul>
        <button type="button" className={`chip chip--option scene__invite ${joined ? 'is-spent' : ''}`} onClick={invite} disabled={joined}>
          <IconPlus size={11} strokeWidth={2.4} />
          {copy.invite}
        </button>
      </footer>
    </div>
  )
}
