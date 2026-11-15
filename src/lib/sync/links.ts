import { isRoomId, isRoomKey } from '../baskets'

/**
 * Los enlaces de vincular y de invitar (`docs/sincronizacion.md`). El QR usa el esquema de la app, que la
 * cámara del iPhone abre en Tasks; el enlace para mandar por WhatsApp va a la web (los esquemas propios no se
 * pueden tocar allí), con lo secreto detrás de `#`, que nunca llega a ningún servidor.
 */
export const APP_SCHEME = 'io.github.diegomolinacatala.tasks'
export const WEB_URL = 'https://diegomolinacatala.github.io/tasks/'

const PAIR_ID = /^[A-Za-z0-9_-]{22}$/
const PUB = /^[A-Za-z0-9_-]{60,120}$/
const INVITE = /^[A-Za-z0-9_-]{20,100}$/

export type LinkRequest =
  /** Un dispositivo nuevo pide que lo vinculen: lo enseña él en un QR. */
  | { kind: 'pair'; id: string; pub: string }
  /** Una invitación a una sala (tu grupo de dispositivos o una cesta compartida). */
  | { kind: 'join'; room: string; key: string; invite: string; scope: JoinScope }

/** A qué invita: tu grupo de dispositivos (lo que hay aquí se sustituye) o una cesta compartida. */
export type JoinScope = 'devices' | 'basket'

const SCOPE_CODE: Record<JoinScope, string> = { devices: 'p', basket: 'b' }

export const pairUrl = (id: string, pub: string): string => `${APP_SCHEME}://link/${id}#${pub}`

export interface Invitation {
  room: string
  key: string
  invite: string
  scope: JoinScope
}

export const joinAppUrl = ({ room, key, invite, scope }: Invitation): string =>
  `${APP_SCHEME}://join/${room}#${key}.${invite}.${SCOPE_CODE[scope]}`

export const joinWebUrl = ({ room, key, invite, scope }: Invitation, base = WEB_URL): string =>
  `${base}#join=${room}.${key}.${invite}.${SCOPE_CODE[scope]}`

function parseJoin(room: string, rest: string): LinkRequest | null {
  const [key = '', invite = '', code, extra] = rest.split('.')
  if (extra !== undefined || !isRoomId(room) || !isRoomKey(key) || !INVITE.test(invite)) return null
  const scope: JoinScope | null = code === 'p' ? 'devices' : code === 'b' ? 'basket' : null
  return scope ? { kind: 'join', room, key, invite, scope } : null
}

/** Lo que pide un enlace abierto en la app o en la web; `null` si no es nuestro o está mal. */
export function parseLink(raw: string): LinkRequest | null {
  const text = raw.trim()
  const hash = text.indexOf('#')
  const fragment = hash < 0 ? '' : text.slice(hash + 1)
  const head = hash < 0 ? text : text.slice(0, hash)
  const app = new RegExp(`^${APP_SCHEME.replace(/\./g, '\\.')}://(link|join)/([A-Za-z0-9_-]+)/?$`).exec(head)
  if (app) {
    const [, kind = '', id = ''] = app
    if (kind === 'link') return PAIR_ID.test(id) && PUB.test(fragment) ? { kind: 'pair', id, pub: fragment } : null
    return parseJoin(id, fragment)
  }
  const web = /^join=([A-Za-z0-9_-]{22})\.(.+)$/.exec(fragment)
  return web ? parseJoin(web[1] ?? '', web[2] ?? '') : null
}
