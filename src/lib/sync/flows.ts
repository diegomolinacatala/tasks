import type { RoomLink } from '../../types'
import { isRoomId, isRoomKey } from '../baskets'
import {
  answerPairing,
  createInvite,
  createRoom,
  joinRoom,
  listMembers,
  readPairing,
  removeMember,
  startPairing,
} from './api'
import type { Member, RoomKind } from './api'
import { newPairKeys, newRoomKey, pairCode, pairSecret, roomKeys, seal, unseal } from './crypto'
import type { Invitation, JoinScope } from './links'
import { pairUrl } from './links'

/**
 * Los pasos de vincular y de compartir (`docs/sincronizacion.md`), sin React: crear una sala, invitar,
 * unirse, emparejar un dispositivo nuevo, ver y quitar miembros. Los nombres de los miembros van cifrados.
 */

/** Cuánto vale el QR de un dispositivo (emparejar o invitar a tu grupo): lo justo para escanearlo. */
export const DEVICE_INVITE_TTL = 10 * 60
/** Lo que vale el enlace de una cesta compartida: lo bastante para que lo abran en el chat. */
export const BASKET_INVITE_TTL = 7 * 24 * 60 * 60
export const BASKET_INVITE_USES = 20
const PAIR_POLL_MS = 2000
const PAIR_TIMEOUT_MS = 10 * 60 * 1000

/** Cómo se llama este dispositivo en tu lista: "iPhone", "Windows · Edge". Nada que identifique a nadie. */
export function deviceLabel(userAgent = typeof navigator === 'undefined' ? '' : navigator.userAgent): string {
  const system = /iPhone/.test(userAgent)
    ? 'iPhone'
    : /iPad/.test(userAgent)
      ? 'iPad'
      : /Android/.test(userAgent)
        ? 'Android'
        : /Windows/.test(userAgent)
          ? 'Windows'
          : /Macintosh|Mac OS X/.test(userAgent)
            ? 'Mac'
            : /Linux/.test(userAgent)
              ? 'Linux'
              : ''
  if (system === 'iPhone' || system === 'iPad') return system
  const browser = /Edg\//.test(userAgent) ? 'Edge' : /Firefox\//.test(userAgent) ? 'Firefox' : /Chrome\//.test(userAgent) ? 'Chrome' : /Safari\//.test(userAgent) ? 'Safari' : ''
  return [system, browser].filter(Boolean).join(' · ') || 'Navegador'
}

const sealName = async (key: string, name: string) => seal((await roomKeys(key)).enc, name.slice(0, 60))

/** Una sala nueva de la que eres dueño. */
export async function createLinkedRoom(base: string, kind: RoomKind, name: string): Promise<RoomLink> {
  const key = newRoomKey()
  const joined = await createRoom(base, kind, await sealName(key, name))
  return { room: joined.room, key, member: joined.member, token: joined.token, owner: true }
}

export async function joinLinkedRoom(base: string, invitation: Invitation, name: string): Promise<RoomLink & { kind: RoomKind }> {
  const joined = await joinRoom(base, invitation.room, invitation.invite, await sealName(invitation.key, name))
  return {
    room: invitation.room,
    key: invitation.key,
    member: joined.member,
    token: joined.token,
    owner: joined.kind === 'personal',
    kind: joined.kind,
  }
}

export async function inviteTo(base: string, link: RoomLink, scope: JoinScope): Promise<Invitation> {
  const ttl = scope === 'basket' ? BASKET_INVITE_TTL : DEVICE_INVITE_TTL
  const invite = await createInvite(base, link.room, link.token, ttl, scope === 'basket' ? BASKET_INVITE_USES : 1)
  return { room: link.room, key: link.key, invite, scope }
}

export interface MemberView extends Omit<Member, 'name'> {
  name: string
}

export async function membersOf(base: string, link: RoomLink): Promise<MemberView[]> {
  const [members, keys] = await Promise.all([listMembers(base, link.room, link.token), roomKeys(link.key)])
  const named = await Promise.all(
    members.map(async (member) => {
      const name = await unseal(keys.enc, member.name)
      return { ...member, name: typeof name === 'string' && name.trim() ? name.trim() : '—' }
    }),
  )
  return named.sort((a, b) => Number(b.you) - Number(a.you) || a.created - b.created)
}

export const removeFromRoom = (base: string, link: RoomLink, member: string): Promise<void> => removeMember(base, link.room, link.token, member)

export interface PairReply {
  own: Awaited<ReturnType<typeof newPairKeys>>
  /** Las cifras que enseñará también el dispositivo nuevo al recibir la respuesta. */
  code: string
}

/** Antes de responder: las claves de este lado y las cifras que tienen que coincidir. */
export async function preparePairing(request: { pub: string }): Promise<PairReply> {
  const own = await newPairKeys()
  return { own, code: await pairCode(request.pub, own.pub) }
}

/** Emparejar desde el dispositivo que ya está vinculado: le manda al nuevo, cifrado, cómo entrar. */
export async function approvePairing(base: string, link: RoomLink, request: { id: string; pub: string }, own: PairReply['own']): Promise<void> {
  const invitation = await inviteTo(base, link, 'devices')
  const secret = await pairSecret(own.privateKey, request.pub)
  const box = await seal(secret, { room: invitation.room, key: invitation.key, invite: invitation.invite })
  await answerPairing(base, request.id, own.pub, box)
}

export interface PairSession {
  /** Lo que lleva el QR. */
  url: string
  /**
   * Se resuelve cuando el otro responde: la invitación y las cuatro cifras que tiene que enseñar también el
   * iPhone (no se entra hasta confirmarlas); `null` si caduca o se cancela.
   */
  result: Promise<{ invitation: Invitation; code: string } | null>
  cancel: () => void
}

/** Emparejar desde el dispositivo nuevo: enseña un QR y espera a que lo escaneen. */
export async function startPairSession(base: string): Promise<PairSession> {
  const keys = await newPairKeys()
  const id = await startPairing(base, keys.pub)
  let cancelled = false
  const started = Date.now()
  const result = (async (): Promise<{ invitation: Invitation; code: string } | null> => {
    while (!cancelled && Date.now() - started < PAIR_TIMEOUT_MS) {
      await new Promise((resolve) => setTimeout(resolve, PAIR_POLL_MS))
      if (cancelled) return null
      const state = await readPairing(base, id).catch(() => null)
      if (!state?.reply) continue
      const secret = await pairSecret(keys.privateKey, state.reply.pub)
      const box = (await unseal(secret, state.reply.box)) as Record<string, unknown> | null
      if (!box || !isRoomId(box.room) || !isRoomKey(box.key) || typeof box.invite !== 'string' || !/^[A-Za-z0-9_-]{20,100}$/.test(box.invite)) return null
      return {
        invitation: { room: box.room, key: box.key, invite: box.invite, scope: 'devices' },
        code: await pairCode(keys.pub, state.reply.pub),
      }
    }
    return null
  })()
  return {
    url: pairUrl(id, keys.pub),
    result,
    cancel: () => {
      cancelled = true
    },
  }
}
