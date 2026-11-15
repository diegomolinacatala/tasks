import { useEffect, useRef, useState } from 'react'
import { openBasket } from '../../lib/basketTab'
import { pick } from '../../lib/i18n'
import { isNative } from '../../lib/platform'
import { haptic } from '../../lib/platform/feedback'
import { joinAppUrl } from '../../lib/sync/links'
import type { Invitation } from '../../lib/sync/links'
import { useCopy } from '../../state/LanguageProvider'
import { useAppState } from '../../state/StoreProvider'
import { Sheet } from '../ui/Sheet'
import { useToast } from '../ui/Toast'
import { SettingsSheetTitle } from '../settings/SettingsRow'
import { errorText, memberName, rememberMemberName } from './names'
import { useSync } from './SyncProvider'
import './sync.css'

const APP_STORE = 'https://apps.apple.com/app/id6812776586'

const COPY = {
  es: {
    pairTitle: 'Vincular un dispositivo',
    pairText: 'Verá y cambiará lo mismo que este, al momento. Hazlo solo si el código lo enseñaba la pantalla de tu propio dispositivo, que tienes delante.',
    pairCode: 'Al vincular, enseñará',
    pairGo: 'Vincular',
    paired: 'Vinculado: lo tuyo ya está en los dos.',
    joinTitle: 'Unir este dispositivo a los tuyos',
    joinWarning: (device: string) => `Lo que hay ahora en este ${device} se sustituye por lo de tus otros dispositivos.`,
    joinGo: 'Vincular',
    joined: 'Vinculado. Llegando lo tuyo…',
    already: 'Este dispositivo ya está vinculado.',
    other: 'Este dispositivo está vinculado a otro grupo. Desvincúlalo primero en Ajustes → Dispositivos.',
    basketTitle: 'Unirte a una cesta compartida',
    basketText: 'Veréis y tacharéis la misma lista de la compra.',
    basketName: 'Tu nombre en la cesta',
    basketNameHint: 'Solo lo ve quien la comparte, en la lista de miembros.',
    basketGo: 'Unirme',
    basketJoined: 'Ya estás en la cesta.',
    basketAlready: 'Ya estás en esa cesta.',
    appTitle: 'Ábrelo en la app',
    appText: 'Las cestas compartidas y los dispositivos se vinculan desde la app de Tasks.',
    appOpen: 'Abrir en Tasks',
    appGet: 'Descargar Tasks',
    working: 'Un momento…',
    device: isNative ? 'iPhone' : 'navegador',
  },
  en: {
    pairTitle: 'Link a device',
    pairText: 'It will see and change the same as this one, instantly. Only do it if the code was on the screen of your own device, right in front of you.',
    pairCode: 'Once linked, it will show',
    pairGo: 'Link',
    paired: 'Linked: your things are on both now.',
    joinTitle: 'Join this device to yours',
    joinWarning: (device: string) => `What’s on this ${device} now will be replaced by what’s on your other devices.`,
    joinGo: 'Link',
    joined: 'Linked. Your things are on their way…',
    already: 'This device is already linked.',
    other: 'This device is linked to another group. Unlink it first in Settings → Devices.',
    basketTitle: 'Join a shared basket',
    basketText: 'You’ll see and tick off the same shopping list.',
    basketName: 'Your name in the basket',
    basketNameHint: 'Only the people who share it see it, in the members list.',
    basketGo: 'Join',
    basketJoined: 'You’re in the basket.',
    basketAlready: 'You’re already in that basket.',
    appTitle: 'Open it in the app',
    appText: 'Shared baskets and devices are linked from the Tasks app.',
    appOpen: 'Open in Tasks',
    appGet: 'Get Tasks',
    working: 'One moment…',
    device: isNative ? 'iPhone' : 'browser',
  },
} as const

const isIosBrowser = !isNative && typeof navigator !== 'undefined' && /iPhone|iPad/.test(navigator.userAgent)

/**
 * Lo que pide un enlace abierto: vincular el dispositivo del QR escaneado, unir este a tu grupo o entrar en
 * una cesta compartida. Nada se hace sin confirmarlo aquí.
 */
export function LinkPrompt() {
  const sync = useSync()
  const { request } = sync
  const toast = useToast()
  const baskets = useAppState().baskets
  const basketsRef = useRef(baskets)
  basketsRef.current = baskets

  // Lo que no necesita pregunta se resuelve con un aviso. Solo al llegar el enlace: unirse añade la cesta
  // mientras el enlace sigue aquí, y eso no es «ya estabas».
  useEffect(() => {
    const baskets = basketsRef.current
    if (!request || request.kind !== 'join') return
    if (request.scope === 'devices' && sync.link) {
      toast({ message: pick(request.room === sync.link.room ? { es: COPY.es.already, en: COPY.en.already } : { es: COPY.es.other, en: COPY.en.other }) })
      sync.clearRequest()
    } else if (request.scope === 'basket' && baskets.some((basket) => basket.id === request.room)) {
      toast({ message: pick({ es: COPY.es.basketAlready, en: COPY.en.basketAlready }) })
      openBasket(request.room)
      sync.clearRequest()
    }
  }, [request])

  if (!request) return null
  if (request.kind === 'pair') return <PairPrompt id={request.id} pub={request.pub} />
  // Las cestas compartidas son de la app; en la web, solo un ordenador ya vinculado a tu iPhone entra en ellas.
  if (isIosBrowser || (!isNative && request.scope === 'basket' && !sync.link)) return <OpenInApp invitation={request} />
  if (request.scope === 'devices') return sync.link ? null : <JoinDevicesPrompt invitation={request} />
  return baskets.some((basket) => basket.id === request.room) ? null : <JoinBasketPrompt invitation={request} />
}

function PairPrompt({ id, pub }: { id: string; pub: string }) {
  const copy = useCopy(COPY)
  const sync = useSync()
  const toast = useToast()
  const [prepared, setPrepared] = useState<{ code: string; approve: () => Promise<void> } | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let cancelled = false
    void sync.preparePair({ id, pub }).then((next) => !cancelled && setPrepared(next))
    return () => {
      cancelled = true
    }
    // Una sola respuesta por QR: `sync` cambia con la conexión y no debe rehacerla.
  }, [id, pub])

  const approve = async () => {
    if (!prepared) return
    setBusy(true)
    try {
      await prepared.approve()
      haptic('success')
      toast({ message: copy.paired })
      sync.clearRequest()
    } catch (error) {
      toast({ message: errorText(error), tone: 'error' })
      setBusy(false)
    }
  }

  return (
    <Sheet screen="link-pair" open onClose={sync.clearRequest} title={copy.pairTitle}>
      <SettingsSheetTitle>{copy.pairTitle}</SettingsSheetTitle>
      <p className="group__note settings-sheet__text">{copy.pairText}</p>
      <div className="link-qr">
        <span className="link-code">
          {copy.pairCode} <span className="link-code__digits">{prepared?.code ?? '····'}</span>
        </span>
      </div>
      <button type="button" className="sheet__primary" disabled={busy || !prepared} onClick={() => void approve()}>
        {busy ? copy.working : copy.pairGo}
      </button>
    </Sheet>
  )
}

function JoinDevicesPrompt({ invitation }: { invitation: Invitation }) {
  const copy = useCopy(COPY)
  const sync = useSync()
  const toast = useToast()
  const [busy, setBusy] = useState(false)

  const join = async () => {
    setBusy(true)
    try {
      await sync.joinDevices(invitation)
      haptic('success')
      toast({ message: copy.joined })
      sync.clearRequest()
    } catch (error) {
      toast({ message: errorText(error), tone: 'error' })
      setBusy(false)
    }
  }

  return (
    <Sheet screen="link-join" open onClose={sync.clearRequest} title={copy.joinTitle}>
      <SettingsSheetTitle>{copy.joinTitle}</SettingsSheetTitle>
      <p className="link-warning">{copy.joinWarning(copy.device)}</p>
      <button type="button" className="sheet__primary" disabled={busy} onClick={() => void join()}>
        {busy ? copy.working : copy.joinGo}
      </button>
    </Sheet>
  )
}

function JoinBasketPrompt({ invitation }: { invitation: Invitation }) {
  const copy = useCopy(COPY)
  const sync = useSync()
  const toast = useToast()
  const [name, setName] = useState(memberName)
  const [busy, setBusy] = useState(false)

  const join = async () => {
    const me = name.trim()
    if (!me) return
    setBusy(true)
    try {
      rememberMemberName(me)
      const id = await sync.joinBasket(invitation, me)
      haptic('success')
      toast({ message: copy.basketJoined })
      sync.clearRequest()
      openBasket(id)
    } catch (error) {
      toast({ message: errorText(error), tone: 'error' })
      setBusy(false)
    }
  }

  return (
    <Sheet screen="link-basket" open onClose={sync.clearRequest} title={copy.basketTitle}>
      <SettingsSheetTitle>{copy.basketTitle}</SettingsSheetTitle>
      <p className="group__note settings-sheet__text">{copy.basketText}</p>
      <form
        onSubmit={(event) => {
          event.preventDefault()
          void join()
        }}
      >
        <label className="link-label" htmlFor="basket-me">
          {copy.basketName}
        </label>
        <input id="basket-me" className="link-field" value={name} maxLength={40} autoComplete="given-name" onChange={(event) => setName(event.target.value)} />
        <p className="sheet__note">{copy.basketNameHint}</p>
        <button type="submit" className="sheet__primary" disabled={busy || !name.trim()}>
          {busy ? copy.working : copy.basketGo}
        </button>
      </form>
    </Sheet>
  )
}

function OpenInApp({ invitation }: { invitation: Invitation }) {
  const copy = useCopy(COPY)
  const sync = useSync()
  return (
    <Sheet screen="link-app" open onClose={sync.clearRequest} title={copy.appTitle}>
      <SettingsSheetTitle>{copy.appTitle}</SettingsSheetTitle>
      <p className="group__note settings-sheet__text">{copy.appText}</p>
      <a className="sheet__primary link-open" href={joinAppUrl(invitation)}>
        {copy.appOpen}
      </a>
      <a className="sheet__hint" href={APP_STORE} target="_blank" rel="noopener noreferrer">
        {copy.appGet}
      </a>
    </Sheet>
  )
}
