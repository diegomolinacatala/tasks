/**
 * Cifrado del contenido de los avisos. La clave se genera en el dispositivo y no es
 * exportable: el servidor solo ve texto cifrado. Válido en página y en service worker.
 */

const IV_BYTES = 12
const ALGORITHM = 'AES-GCM'

export function toBase64Url(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function fromBase64Url(text: string): Uint8Array<ArrayBuffer> {
  const base64 = text.replace(/-/g, '+').replace(/_/g, '/')
  const binary = atob(base64 + '='.repeat((4 - (base64.length % 4)) % 4))
  return Uint8Array.from(binary, (char) => char.charCodeAt(0))
}

export function createContentKey(): Promise<CryptoKey> {
  return crypto.subtle.generateKey({ name: ALGORITHM, length: 256 }, false, ['encrypt', 'decrypt'])
}

/** `iv || ciphertext` en base64url. */
export async function encryptJson(key: CryptoKey, value: unknown): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES))
  const plain = new TextEncoder().encode(JSON.stringify(value))
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: ALGORITHM, iv }, key, plain))
  const packed = new Uint8Array(IV_BYTES + cipher.length)
  packed.set(iv)
  packed.set(cipher, IV_BYTES)
  return toBase64Url(packed)
}

/** Lanza si el texto no se cifró con esta clave o está manipulado. */
export async function decryptJson(key: CryptoKey, token: string): Promise<unknown> {
  const packed = fromBase64Url(token)
  if (packed.length <= IV_BYTES) throw new Error('Contenido cifrado incompleto')
  const plain = await crypto.subtle.decrypt(
    { name: ALGORITHM, iv: packed.slice(0, IV_BYTES) },
    key,
    packed.slice(IV_BYTES),
  )
  return JSON.parse(new TextDecoder().decode(plain))
}
