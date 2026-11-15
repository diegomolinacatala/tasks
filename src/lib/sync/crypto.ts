/**
 * Cifrado de extremo a extremo de las salas (`docs/sincronizacion.md`): el servidor guarda y reparte, pero
 * sin la clave de la sala no puede leer nada ni saber qué es cada registro.
 */

const encoder = new TextEncoder()
const decoder = new TextDecoder()

export function toBase64Url(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function fromBase64Url(text: string): Uint8Array<ArrayBuffer> {
  const base64 = text.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((text.length + 3) % 4)
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

const random = (length: number) => crypto.getRandomValues(new Uint8Array(length))

/** La clave de una sala nueva: 32 bytes aleatorios. */
export const newRoomKey = (): string => toBase64Url(random(32))

export interface RoomKeys {
  enc: CryptoKey
  mac: CryptoKey
}

const hkdf = (info: string) => ({ name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(0), info: encoder.encode(info) })

async function deriveFrom(secret: Uint8Array<ArrayBuffer>): Promise<RoomKeys> {
  const base = await crypto.subtle.importKey('raw', secret, 'HKDF', false, ['deriveKey'])
  const enc = await crypto.subtle.deriveKey(hkdf('tasks/enc'), base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'])
  const mac = await crypto.subtle.deriveKey(hkdf('tasks/mac'), base, { name: 'HMAC', hash: 'SHA-256', length: 256 }, false, ['sign'])
  return { enc, mac }
}

export const roomKeys = (key: string): Promise<RoomKeys> => deriveFrom(fromBase64Url(key))

/** Bajo qué nombre guarda el servidor un registro: 22 caracteres que no dicen qué es. */
export async function recordId(keys: RoomKeys, logical: string): Promise<string> {
  const signature = await crypto.subtle.sign('HMAC', keys.mac, encoder.encode(logical))
  return toBase64Url(new Uint8Array(signature)).slice(0, 22)
}

export async function seal(key: CryptoKey, value: unknown): Promise<string> {
  const iv = random(12)
  const data = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoder.encode(JSON.stringify(value)))
  const out = new Uint8Array(iv.length + data.byteLength)
  out.set(iv)
  out.set(new Uint8Array(data), iv.length)
  return toBase64Url(out)
}

/** Lo descifrado, o `null` si no se puede (otra clave, datos rotos). */
export async function unseal(key: CryptoKey, text: string): Promise<unknown> {
  try {
    const bytes = fromBase64Url(text)
    const data = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: bytes.slice(0, 12) }, key, bytes.slice(12))
    return JSON.parse(decoder.decode(data))
  } catch {
    return null
  }
}

/** Emparejar: el dispositivo nuevo y el que lo vincula acuerdan una clave sin que viaje (ECDH P-256). */
export interface PairKeys {
  pub: string
  privateKey: CryptoKey
}

export async function newPairKeys(): Promise<PairKeys> {
  const pair = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, false, ['deriveBits'])
  const raw = await crypto.subtle.exportKey('raw', pair.publicKey)
  return { pub: toBase64Url(new Uint8Array(raw)), privateKey: pair.privateKey }
}

/** La clave AES que comparten los dos lados de un emparejamiento. */
export async function pairSecret(own: CryptoKey, peerPub: string): Promise<CryptoKey> {
  const peer = await crypto.subtle.importKey('raw', fromBase64Url(peerPub), { name: 'ECDH', namedCurve: 'P-256' }, false, [])
  const bits = await crypto.subtle.deriveBits({ name: 'ECDH', public: peer }, own, 256)
  const base = await crypto.subtle.importKey('raw', bits, 'HKDF', false, ['deriveKey'])
  return crypto.subtle.deriveKey(hkdf('tasks/pair'), base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'])
}

/**
 * Cuatro cifras que enseñan los dos dispositivos para comprobar que se están viendo el uno al otro. Salen de las
 * dos claves públicas: quien respondiera en lugar de tu iPhone (habiendo visto el QR) daría otras.
 */
export async function pairCode(newPub: string, replyPub: string): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(`${newPub}.${replyPub}`)))
  const number = new DataView(digest.buffer).getUint32(0)
  return String(number % 10000).padStart(4, '0')
}
