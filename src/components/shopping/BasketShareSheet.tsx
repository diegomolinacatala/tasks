import { useCallback, useEffect, useState } from 'react'
import { MAX_BASKET_NAME } from '../../lib/baskets'
import { isNative } from '../../lib/platform'
import { haptic } from '../../lib/platform/feedback'
import { joinAppUrl, joinWebUrl } from '../../lib/sync/links'
import type { Invitation } from '../../lib/sync/links'
import type { MemberView } from '../../lib/sync/runtime'
import { useCopy } from '../../state/LanguageProvider'
import { useDispatch } from '../../state/StoreProvider'
import type { SharedBasket } from '../../types'
import { SettingsSheetTitle } from '../settings/SettingsRow'
import { errorText } from '../sync/names'
import { QrCode } from '../sync/QrCode'
import { useSync } from '../sync/SyncProvider'
import { Sheet } from '../ui/Sheet'
import { useToast } from '../ui/Toast'
import '../sync/sync.css'

const COPY = {
  es: {
    members: 'Miembros',
    owner: 'Dueño',
    you: 'Tú',
    loading: 'Cargando…',
    invite: 'Invitar',
    inviteHint: 'Que lo escaneen con la Cámara del iPhone, o mándales el enlace. Vale una semana; necesitan la app de Tasks.',
    share: 'Mandar el enlace',
    shareText: (name: string) => `Únete a la cesta «${name}» en Tasks:`,
    copied: 'Enlace copiado',
    onlyOwner: 'Solo quien la creó puede invitar.',
    remove: 'Echar',
    confirm: '¿Seguro?',
    removed: (name: string) => `${name} ya no está en la cesta. Las invitaciones de antes ya no valen.`,
    rename: 'Nombre',
    leave: 'Salir de la cesta',
    leaveConfirm: 'Toca otra vez para salir',
    leaveNote: (owner: boolean) =>
      owner ? 'Si sales, pasará a ser de quien lleve más tiempo en ella; si no queda nadie, se borra.' : 'Desaparece de tus dispositivos; los demás la siguen teniendo.',
    left: (name: string) => `Has salido de «${name}».`,
  },
  en: {
    members: 'Members',
    owner: 'Owner',
    you: 'You',
    loading: 'Loading…',
    invite: 'Invite',
    inviteHint: 'Have them scan it with the iPhone Camera, or send them the link. Valid for a week; they need the Tasks app.',
    share: 'Send the link',
    shareText: (name: string) => `Join the “${name}” basket on Tasks:`,
    copied: 'Link copied',
    onlyOwner: 'Only whoever created it can invite.',
    remove: 'Remove',
    confirm: 'Sure?',
    removed: (name: string) => `${name} is no longer in the basket. Earlier invitations no longer work.`,
    rename: 'Name',
    leave: 'Leave the basket',
    leaveConfirm: 'Tap again to leave',
    leaveNote: (owner: boolean) =>
      owner ? 'If you leave, it passes to whoever has been in it longest; if nobody is left, it’s deleted.' : 'It disappears from your devices; the others keep it.',
    left: (name: string) => `You left “${name}”.`,
  },
} as const

async function shareLink(text: string, url: string): Promise<boolean> {
  try {
    if (isNative) {
      const { Share } = await import('@capacitor/share')
      await Share.share({ text, url })
      return true
    }
    if (navigator.share) {
      await navigator.share({ text, url })
      return true
    }
  } catch (error) {
    // Cerrar la hoja sin elegir destino no es un error.
    if (error instanceof Error && /cancel|abort/i.test(`${error.name} ${error.message}`)) return true
  }
  return false
}

/** La invitación vigente de cada cesta en este dispositivo: se reutiliza hasta un día antes de caducar. */
const INVITE_KEY = (id: string) => `tasks:invite:${id}`
const INVITE_REUSE_MS = 6 * 24 * 60 * 60 * 1000

function keptInvite(id: string): Invitation | null {
  try {
    const raw = JSON.parse(localStorage.getItem(INVITE_KEY(id)) ?? 'null') as { invitation?: Invitation; at?: number } | null
    if (!raw?.invitation || typeof raw.at !== 'number' || Date.now() - raw.at > INVITE_REUSE_MS) return null
    return raw.invitation.room === id ? raw.invitation : null
  } catch {
    return null
  }
}

function keepInvite(id: string, invitation: Invitation): void {
  try {
    localStorage.setItem(INVITE_KEY(id), JSON.stringify({ invitation, at: Date.now() }))
  } catch {
    // Sin almacenamiento se pide otra la próxima vez.
  }
}

function forgetInvite(id: string): void {
  try {
    localStorage.removeItem(INVITE_KEY(id))
  } catch {
    // Nada que borrar.
  }
}

/** Una cesta compartida: quién está, invitar (QR y enlace), cambiarle el nombre y salir. */
export function BasketShareSheet({ basket, onClose }: { basket: SharedBasket; onClose: () => void }) {
  const copy = useCopy(COPY)
  const sync = useSync()
  const dispatch = useDispatch()
  const toast = useToast()
  const [members, setMembers] = useState<MemberView[] | null>(null)
  const [invitation, setInvitation] = useState<Invitation | null>(null)
  const [confirming, setConfirming] = useState<string | null>(null)
  const [name, setName] = useState(basket.name)
  /** Echar a alguien anula las invitaciones: se pide otra. */
  const [round, setRound] = useState(0)
  // Quién manda lo dice el servidor: si el dueño se fue, el más antiguo pasa a serlo.
  const me = members?.find((member) => member.you)
  const owner = me ? me.role === 'owner' : basket.link.owner

  useEffect(() => {
    if (me && (me.role === 'owner') !== basket.link.owner) dispatch({ type: 'basket/owner', id: basket.id, owner: me.role === 'owner' })
  }, [me, basket.id, basket.link.owner, dispatch])

  const load = useCallback(() => {
    sync
      .basketMembers(basket.id)
      .then(setMembers)
      .catch(() => setMembers([]))
  }, [sync, basket.id])

  useEffect(load, [basket.id])

  useEffect(() => {
    if (!owner) return
    let cancelled = false
    // La de antes vale mientras no caduque: el servidor admite pocas vivas y cada una es un enlace más suelto.
    const kept = keptInvite(basket.id)
    if (kept) {
      setInvitation(kept)
      return
    }
    sync
      .inviteBasket(basket.id)
      .then((next) => {
        if (cancelled) return
        keepInvite(basket.id, next)
        setInvitation(next)
      })
      .catch((error: unknown) => !cancelled && toast({ message: errorText(error), tone: 'error' }))
    return () => {
      cancelled = true
    }
    // Una invitación por apertura del panel: rehacerla al cambiar la conexión sería gastar.
  }, [basket.id, owner, round])

  const send = async () => {
    if (!invitation) return
    const url = joinWebUrl(invitation)
    if (await shareLink(copy.shareText(basket.name), url)) return
    await navigator.clipboard?.writeText(`${copy.shareText(basket.name)} ${url}`).catch(() => undefined)
    toast({ message: copy.copied })
  }

  const remove = async (member: MemberView) => {
    if (confirming !== member.id) return setConfirming(member.id)
    setConfirming(null)
    try {
      await sync.removeBasketMember(basket.id, member.id)
      haptic('warning')
      toast({ message: copy.removed(member.name) })
      setInvitation(null)
      forgetInvite(basket.id)
      setRound((n) => n + 1)
      load()
    } catch (error) {
      toast({ message: errorText(error), tone: 'error' })
    }
  }

  const leave = async () => {
    if (confirming !== 'leave') return setConfirming('leave')
    try {
      await sync.leaveBasket(basket.id)
      toast({ message: copy.left(basket.name) })
      onClose()
    } catch (error) {
      toast({ message: errorText(error), tone: 'error' })
    }
  }

  const rename = () => {
    const next = name.trim()
    if (next && next !== basket.name) dispatch({ type: 'basket/rename', id: basket.id, name: next })
    else setName(basket.name)
  }

  return (
    <Sheet screen="basket-share" className="sheet--over" open onClose={onClose} title={basket.name}>
      <SettingsSheetTitle>{basket.name}</SettingsSheetTitle>

      <label className="link-label" htmlFor="basket-rename">
        {copy.rename}
      </label>
      <input
        id="basket-rename"
        className="link-field"
        value={name}
        maxLength={MAX_BASKET_NAME}
        onChange={(event) => setName(event.target.value)}
        onBlur={rename}
        onKeyDown={(event) => event.key === 'Enter' && event.currentTarget.blur()}
      />

      <h3 className="link-label">{copy.invite}</h3>
      {owner ? (
        <div className="link-qr">
          <div className="link-qr__frame">
            {invitation ? <QrCode value={joinAppUrl(invitation)} label={copy.invite} size={180} /> : <span className="link-qr__wait link-qr__wait--small">{copy.loading}</span>}
          </div>
          <p className="sheet__note">{copy.inviteHint}</p>
          <button type="button" className="sheet__primary" disabled={!invitation} onClick={() => void send()}>
            {copy.share}
          </button>
        </div>
      ) : (
        <p className="sheet__note">{copy.onlyOwner}</p>
      )}

      <h3 className="link-label">{copy.members}</h3>
      <div className="group__card">
        {members === null && <p className="link-member">{copy.loading}</p>}
        {members?.map((member) => (
          <div key={member.id} className="link-member">
            <span className="link-member__dot" aria-hidden="true">
              {member.name.slice(0, 1).toUpperCase()}
            </span>
            <span className="link-member__text">
              <span className="link-member__name">{member.you ? `${member.name} · ${copy.you}` : member.name}</span>
              {member.role === 'owner' && <span className="link-member__meta">{copy.owner}</span>}
            </span>
            {owner && !member.you && (
              <button type="button" className="link-member__remove" onClick={() => void remove(member)}>
                {confirming === member.id ? copy.confirm : copy.remove}
              </button>
            )}
          </div>
        ))}
      </div>

      <button type="button" className={`group__row group__row--danger link-unlink ${confirming === 'leave' ? 'is-confirming' : ''}`} onClick={() => void leave()}>
        {confirming === 'leave' ? copy.leaveConfirm : copy.leave}
      </button>
      <p className="sheet__note">{copy.leaveNote(owner)}</p>
    </Sheet>
  )
}
