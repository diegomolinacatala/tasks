import { useCallback, useEffect, useState } from 'react'
import { isNative } from '../../lib/platform'
import { haptic } from '../../lib/platform/feedback'
import { joinAppUrl, joinWebUrl } from '../../lib/sync/links'
import type { Invitation } from '../../lib/sync/links'
import type { MemberView, PairSession } from '../../lib/sync/runtime'
import type { Invitation as PairInvitation } from '../../lib/sync/links'
import { useCopy } from '../../state/LanguageProvider'
import { SettingsSheetTitle } from '../settings/SettingsRow'
import { useToast } from '../ui/Toast'
import { errorText } from './names'
import { QrCode } from './QrCode'
import { useSync } from './SyncProvider'
import './sync.css'

const COPY = {
  es: {
    title: 'Dispositivos',
    off: 'Sin vincular',
    online: 'Al día',
    offline: 'Sin conexión',
    connecting: 'Conectando…',
    count: (n: number) => (n === 1 ? '1 vinculado' : `${n} vinculados`),
    newTitle: 'Vincula este dispositivo',
    newSteps: [
      ['En el iPhone, abre la ', 'Cámara', ' y apunta a este código.'],
      ['Toca ', 'Abrir en Tasks', ' y después ', 'Vincular', '.'],
      ['Aquí saldrán unas cifras: comprueba que son las del iPhone. Lo de este dispositivo se sustituye por lo tuyo.'],
    ],
    code: 'Cifras',
    checkTitle: '¿Son las mismas cifras?',
    checkText: 'Tienen que ser las que enseña tu iPhone. Si no, alguien más ha visto el código: no vincules.',
    checkGo: 'Sí, vincular',
    checkNo: 'No coinciden: otro código',
    expired: 'El código ha caducado.',
    again: 'Otro código',
    waiting: 'Preparando…',
    joined: 'Vinculado. Llegando lo tuyo…',
    phoneTitle: 'Vincula un ordenador',
    phoneSteps: [
      ['En el ordenador, abre ', 'diegomolinacatala.github.io/tasks', '.'],
      ['Allí, ', 'Ajustes → Dispositivos', ': enseñará un código.'],
      ['Escanéalo con la ', 'Cámara', ' de este iPhone y toca ', 'Abrir en Tasks', '.'],
    ],
    phoneNew: '¿Este iPhone es nuevo y ya tenías otro dispositivo vinculado? Ábrelo allí, toca «Añadir un dispositivo» y escanea su código con la Cámara.',
    you: 'Este dispositivo',
    since: (date: string) => `Desde el ${date}`,
    remove: 'Quitar',
    confirm: '¿Seguro?',
    removed: 'Quitado. Ya no se sincroniza.',
    add: 'Añadir un dispositivo',
    addHint: 'Escanéalo con la Cámara del otro iPhone, o abre el enlace en el otro ordenador. Vale 10 minutos y una vez.',
    copyLink: 'Copiar enlace',
    copied: 'Enlace copiado',
    unlink: 'Desvincular este dispositivo',
    unlinkConfirm: 'Toca otra vez para desvincularlo',
    unlinkNote: 'Lo que hay aquí se queda; solo deja de sincronizarse.',
    unlinked: 'Desvinculado.',
    loading: 'Cargando…',
    pushNote: 'Los avisos suenan en el iPhone. En un ordenador, actívalos en Ajustes → Avisos si los quieres también ahí.',
  },
  en: {
    title: 'Devices',
    off: 'Not linked',
    online: 'Up to date',
    offline: 'Offline',
    connecting: 'Connecting…',
    count: (n: number) => (n === 1 ? '1 linked' : `${n} linked`),
    newTitle: 'Link this device',
    newSteps: [
      ['On your iPhone, open the ', 'Camera', ' and point it at this code.'],
      ['Tap ', 'Open in Tasks', ' and then ', 'Link', '.'],
      ['Some digits will show up here: check they match the iPhone’s. What’s on this device is replaced by your things.'],
    ],
    code: 'Digits',
    checkTitle: 'Same digits?',
    checkText: 'They must be the ones your iPhone shows. If not, someone else saw the code: don’t link.',
    checkGo: 'Yes, link',
    checkNo: 'They don’t match: new code',
    expired: 'The code has expired.',
    again: 'New code',
    waiting: 'Getting ready…',
    joined: 'Linked. Your things are on their way…',
    phoneTitle: 'Link a computer',
    phoneSteps: [
      ['On the computer, open ', 'diegomolinacatala.github.io/tasks', '.'],
      ['There, ', 'Settings → Devices', ': it will show a code.'],
      ['Scan it with this iPhone’s ', 'Camera', ' and tap ', 'Open in Tasks', '.'],
    ],
    phoneNew: 'Is this a new iPhone and you already had another linked device? Open it there, tap “Add a device” and scan its code with the Camera.',
    you: 'This device',
    since: (date: string) => `Since ${date}`,
    remove: 'Remove',
    confirm: 'Sure?',
    removed: 'Removed. It no longer syncs.',
    add: 'Add a device',
    addHint: 'Scan it with the other iPhone’s Camera, or open the link on the other computer. Valid for 10 minutes, once.',
    copyLink: 'Copy link',
    copied: 'Link copied',
    unlink: 'Unlink this device',
    unlinkConfirm: 'Tap again to unlink it',
    unlinkNote: 'What’s here stays; it just stops syncing.',
    unlinked: 'Unlinked.',
    loading: 'Loading…',
    pushNote: 'Reminders ring on the iPhone. On a computer, turn them on in Settings → Notifications if you want them there too.',
  },
} as const

type Step = readonly string[]

/** Un paso con sus palabras clave en negrita (las impares). */
function Steps({ steps }: { steps: readonly Step[] }) {
  return (
    <ol className="link-steps">
      {steps.map((parts, index) => (
        <li key={index}>{parts.map((part, at) => (at % 2 ? <b key={at}>{part}</b> : <span key={at}>{part}</span>))}</li>
      ))}
    </ol>
  )
}

/** El contenido del panel de Dispositivos (en su propio trozo: lleva el QR). */
export function DevicesSheet() {
  const sync = useSync()
  return sync.link ? <Linked /> : <Unlinked />
}

function Unlinked() {
  const copy = useCopy(COPY)
  if (isNative) {
    return (
      <>
        <SettingsSheetTitle>{copy.phoneTitle}</SettingsSheetTitle>
        <Steps steps={copy.phoneSteps} />
        <p className="group__note settings-sheet__text">{copy.phoneNew}</p>
      </>
    )
  }
  return <PairPanel />
}

/** El QR de este dispositivo nuevo: espera a que el iPhone lo escanee y responda. */
function PairPanel() {
  const copy = useCopy(COPY)
  const sync = useSync()
  const toast = useToast()
  const [session, setSession] = useState<PairSession | null>(null)
  const [expired, setExpired] = useState(false)
  const [attempt, setAttempt] = useState(0)
  /** El iPhone ha respondido: falta comprobar que enseña las mismas cifras. */
  const [answer, setAnswer] = useState<{ invitation: PairInvitation; code: string } | null>(null)
  const [joining, setJoining] = useState(false)

  useEffect(() => {
    let active: PairSession | null = null
    let cancelled = false
    setExpired(false)
    setSession(null)
    setAnswer(null)
    sync
      .pair()
      .then(async (next) => {
        if (cancelled) return next.cancel()
        active = next
        setSession(next)
        const reply = await next.result
        if (cancelled) return
        if (!reply) return setExpired(true)
        haptic('selection')
        setAnswer(reply)
      })
      .catch((error: unknown) => {
        if (cancelled) return
        toast({ message: errorText(error), tone: 'error' })
        setExpired(true)
      })
    return () => {
      cancelled = true
      active?.cancel()
    }
    // `sync` cambia con el estado de la conexión: el QR no debe rehacerse por eso.
  }, [attempt])

  const join = async () => {
    if (!answer) return
    setJoining(true)
    try {
      await sync.joinDevices(answer.invitation)
      haptic('success')
      toast({ message: copy.joined })
    } catch (error) {
      toast({ message: errorText(error), tone: 'error' })
      setJoining(false)
    }
  }

  if (answer) {
    return (
      <>
        <SettingsSheetTitle>{copy.checkTitle}</SettingsSheetTitle>
        <div className="link-qr">
          <span className="link-code">
            {copy.code} <span className="link-code__digits">{answer.code}</span>
          </span>
        </div>
        <p className="group__note settings-sheet__text">{copy.checkText}</p>
        <button type="button" className="sheet__primary" disabled={joining} onClick={() => void join()}>
          {copy.checkGo}
        </button>
        <button type="button" className="sheet__hint" disabled={joining} onClick={() => setAttempt((n) => n + 1)}>
          {copy.checkNo}
        </button>
      </>
    )
  }

  return (
    <>
      <SettingsSheetTitle>{copy.newTitle}</SettingsSheetTitle>
      <div className="link-qr">
        <div className="link-qr__frame">
          {session && !expired ? <QrCode value={session.url} label={copy.newTitle} /> : <span className="link-qr__wait">{expired ? copy.expired : copy.waiting}</span>}
        </div>
        {expired && (
          <button type="button" className="sheet__hint" onClick={() => setAttempt((n) => n + 1)}>
            {copy.again}
          </button>
        )}
      </div>
      <Steps steps={copy.newSteps} />
      <p className="sheet__note">{copy.pushNote}</p>
    </>
  )
}

function Linked() {
  const copy = useCopy(COPY)
  const sync = useSync()
  const toast = useToast()
  const [members, setMembers] = useState<MemberView[] | null>(null)
  const [confirming, setConfirming] = useState<string | null>(null)
  const [invitation, setInvitation] = useState<Invitation | null>(null)

  const load = useCallback(() => {
    sync
      .devices()
      .then(setMembers)
      .catch(() => setMembers([]))
  }, [sync.link])

  useEffect(load, [load])

  const remove = async (member: MemberView) => {
    if (confirming !== member.id) return setConfirming(member.id)
    setConfirming(null)
    try {
      await sync.removeDevice(member.id)
      toast({ message: copy.removed })
      load()
    } catch (error) {
      toast({ message: errorText(error), tone: 'error' })
    }
  }

  const invite = async () => {
    try {
      setInvitation(await sync.inviteDevice())
    } catch (error) {
      toast({ message: errorText(error), tone: 'error' })
    }
  }

  const copyLink = async () => {
    if (!invitation) return
    await navigator.clipboard?.writeText(joinWebUrl(invitation)).catch(() => undefined)
    toast({ message: copy.copied })
  }

  const unlink = async () => {
    if (confirming !== 'self') return setConfirming('self')
    await sync.unlink()
    toast({ message: copy.unlinked })
  }

  const date = (at: number) => new Date(at).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })

  return (
    <>
      <SettingsSheetTitle>{copy.title}</SettingsSheetTitle>
      <div className="group__card">
        {members === null && <p className="link-member">{copy.loading}</p>}
        {members?.map((member) => (
          <div key={member.id} className="link-member">
            <span className="link-member__dot" aria-hidden="true">
              {member.name.slice(0, 1).toUpperCase()}
            </span>
            <span className="link-member__text">
              <span className="link-member__name">{member.you ? `${member.name} · ${copy.you}` : member.name}</span>
              <span className="link-member__meta">{copy.since(date(member.created))}</span>
            </span>
            {!member.you && (
              <button type="button" className="link-member__remove" onClick={() => void remove(member)}>
                {confirming === member.id ? copy.confirm : copy.remove}
              </button>
            )}
          </div>
        ))}
      </div>

      {invitation ? (
        <div className="link-qr">
          <div className="link-qr__frame">
            <QrCode value={joinAppUrl(invitation)} label={copy.add} />
          </div>
          <p className="sheet__note">{copy.addHint}</p>
          <button type="button" className="sheet__hint" onClick={() => void copyLink()}>
            {copy.copyLink}
          </button>
        </div>
      ) : (
        <button type="button" className="sheet__primary" onClick={() => void invite()}>
          {copy.add}
        </button>
      )}

      <button type="button" className={`group__row group__row--danger link-unlink ${confirming === 'self' ? 'is-confirming' : ''}`} onClick={() => void unlink()}>
        {confirming === 'self' ? copy.unlinkConfirm : copy.unlink}
      </button>
      <p className="sheet__note">{copy.unlinkNote}</p>
    </>
  )
}

