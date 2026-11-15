import { useState } from 'react'
import { SHARE_EVENT } from './shareEvent'
import { openBasket } from '../../lib/basketTab'
import { MAX_BASKETS, MAX_BASKET_NAME } from '../../lib/baskets'
import { haptic } from '../../lib/platform/feedback'
import { sortedItems } from '../../lib/shopping'
import { useCopy } from '../../state/LanguageProvider'
import type { SharedBasket } from '../../types'
import { SettingsSheetTitle } from '../settings/SettingsRow'
import { errorText, memberName, rememberMemberName } from '../sync/names'
import { useSync } from '../sync/SyncProvider'
import { IconPlus } from '../ui/Icons'
import { Sheet } from '../ui/Sheet'
import { useToast } from '../ui/Toast'

const COPY = {
  es: {
    tabs: 'Cestas',
    mine: 'Mía',
    newBasket: 'Compartida',
    newTitle: 'Nueva cesta compartida',
    newText: 'Para el piso, la familia… Quien invites verá y tachará la misma lista, al momento.',
    name: 'Nombre de la cesta',
    namePlaceholder: 'Piso',
    me: 'Tu nombre en ella',
    meHint: 'Solo sale en la lista de miembros; lo que añadís no lleva nombre.',
    create: 'Crear e invitar',
    working: 'Un momento…',
    full: `Como mucho ${MAX_BASKETS} cestas compartidas.`,
    pending: (count: number) => `${count} por comprar`,
  },
  en: {
    tabs: 'Baskets',
    mine: 'Mine',
    newBasket: 'Shared',
    newTitle: 'New shared basket',
    newText: 'For the flat, the family… Whoever you invite sees and ticks off the same list, instantly.',
    name: 'Basket name',
    namePlaceholder: 'Flat',
    me: 'Your name in it',
    meHint: 'It only shows in the members list; what you add carries no name.',
    create: 'Create and invite',
    working: 'One moment…',
    full: `At most ${MAX_BASKETS} shared baskets.`,
    pending: (count: number) => `${count} to buy`,
  },
} as const

interface BasketTabsProps {
  baskets: readonly SharedBasket[]
  tab: string | null
  onTab: (tab: string | null) => void
  pendingMine: number
}

/** Las pestañas de las cestas: la tuya, las compartidas y, si hay servidor, una nueva. */
export function BasketTabs({ baskets, tab, onTab, pendingMine }: BasketTabsProps) {
  const copy = useCopy(COPY)
  const sync = useSync()
  const [creating, setCreating] = useState(false)

  const pill = (id: string | null, label: string, count: number) => (
    <button
      key={id ?? 'mine'}
      type="button"
      role="tab"
      aria-selected={tab === id}
      className={`basket-tab ${tab === id ? 'is-active' : ''}`}
      onClick={() => {
        haptic('selection')
        onTab(id)
      }}
    >
      <span className="basket-tab__label">{label}</span>
      {count > 0 && (
        <span className="basket-tab__count" aria-label={copy.pending(count)}>
          {count}
        </span>
      )}
    </button>
  )

  return (
    <>
      <div className="basket-tabs" role="tablist" aria-label={copy.tabs}>
        {pill(null, copy.mine, pendingMine)}
        {baskets.map((basket) => pill(basket.id, basket.name, sortedItems(basket.items).pending.length))}
        {sync.available && baskets.length < MAX_BASKETS && (
          <button type="button" className="basket-tab basket-tab--new" onClick={() => setCreating(true)}>
            <IconPlus size={12} strokeWidth={2.4} />
            {copy.newBasket}
          </button>
        )}
      </div>
      {creating && <NewBasketSheet onClose={() => setCreating(false)} />}
    </>
  )
}

function NewBasketSheet({ onClose }: { onClose: () => void }) {
  const copy = useCopy(COPY)
  const sync = useSync()
  const toast = useToast()
  const [name, setName] = useState('')
  const [me, setMe] = useState(memberName)
  const [busy, setBusy] = useState(false)

  const create = async () => {
    if (!name.trim() || !me.trim()) return
    setBusy(true)
    try {
      rememberMemberName(me)
      const id = await sync.createBasket(name.trim(), me.trim())
      haptic('success')
      onClose()
      // Recién creada, lo siguiente es invitar: su panel se abre con el QR y el enlace.
      openBasket(id)
      window.dispatchEvent(new CustomEvent(SHARE_EVENT, { detail: id }))
    } catch (error) {
      toast({ message: errorText(error), tone: 'error' })
      setBusy(false)
    }
  }

  return (
    <Sheet screen="basket-new" className="sheet--over" open onClose={onClose} title={copy.newTitle}>
      <SettingsSheetTitle>{copy.newTitle}</SettingsSheetTitle>
      <p className="group__note settings-sheet__text">{copy.newText}</p>
      <form
        onSubmit={(event) => {
          event.preventDefault()
          void create()
        }}
      >
        <label className="link-label" htmlFor="basket-name">
          {copy.name}
        </label>
        <input
          id="basket-name"
          className="link-field"
          value={name}
          placeholder={copy.namePlaceholder}
          maxLength={MAX_BASKET_NAME}
          autoComplete="off"
          onChange={(event) => setName(event.target.value)}
        />
        <label className="link-label" htmlFor="basket-me-new">
          {copy.me}
        </label>
        <input id="basket-me-new" className="link-field" value={me} maxLength={40} autoComplete="given-name" onChange={(event) => setMe(event.target.value)} />
        <p className="sheet__note">{copy.meHint}</p>
        <button type="submit" className="sheet__primary" disabled={busy || !name.trim() || !me.trim()}>
          {busy ? copy.working : copy.create}
        </button>
      </form>
    </Sheet>
  )
}

/** Dos personas: una cesta compartida. */
export function IconPeople({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="9" cy="8.5" r="3.2" />
      <path d="M3.5 19.5c.6-3.2 2.8-5 5.5-5s4.9 1.8 5.5 5" />
      <path d="M15.6 5.6a3 3 0 0 1 0 5.8M17.4 14.7c1.6.6 2.7 2.2 3.1 4.8" />
    </svg>
  )
}
