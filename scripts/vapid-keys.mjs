// Genera los secrets del Worker de avisos: par VAPID (P-256) y sal para anonimizar IPs.
// Uso: node scripts/vapid-keys.mjs
// Cada valor va SOLO a `wrangler secret put <NOMBRE>`; nunca al repo.
import { webcrypto } from 'node:crypto'

const toBase64Url = (bytes) => Buffer.from(bytes).toString('base64url')

const { publicKey, privateKey } = await webcrypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, [
  'sign',
  'verify',
])

const rawPublic = new Uint8Array(await webcrypto.subtle.exportKey('raw', publicKey))
const { d } = await webcrypto.subtle.exportKey('jwk', privateKey)

const salt = toBase64Url(webcrypto.getRandomValues(new Uint8Array(32)))

process.stdout.write(`VAPID_PUBLIC_KEY=${toBase64Url(rawPublic)}\nVAPID_PRIVATE_KEY=${d}\nIP_HASH_SALT=${salt}\n`)
