import { buildPushPayload, type VapidKeys } from '@block65/webcrypto-web-push'
import type { PushResult, Sender, Subscription } from './types'

const TTL_SECONDS = 60 * 60
const MAX_REASON_CHARS = 120

export function classify(status: number): PushResult {
  if (status >= 200 && status < 300) return 'sent'
  if (status === 404 || status === 410) return 'gone'
  // Apple responde 403 BadJwtToken si el subject o las claves VAPID no son válidos.
  if (status === 401 || status === 403) return 'unauthorized'
  if (status === 400 || status === 413) return 'rejected'
  return 'retry'
}

/** Host del servicio push, sin el token del dispositivo que va en la ruta. */
const serviceOf = (endpoint: string) => {
  try {
    return new URL(endpoint).hostname
  } catch {
    return 'desconocido'
  }
}

/**
 * Envío real con Web Push (RFC 8291 + VAPID) sobre WebCrypto. Mismas cabeceras para el
 * aviso de prueba y los programados: sin `Topic`, que no aporta y no está verificado en iOS.
 */
export function webPushSender(vapid: VapidKeys): Sender {
  return {
    async send(subscription: Subscription, data: string): Promise<PushResult> {
      try {
        const payload = await buildPushPayload(
          { data, options: { ttl: TTL_SECONDS, urgency: 'high' } },
          { ...subscription, expirationTime: null },
          vapid,
        )
        const response = await fetch(subscription.endpoint, payload)
        const result = classify(response.status)
        if (result !== 'sent') {
          // La razón del servicio (p. ej. {"reason":"BadWebPushToken"}) no contiene datos del usuario.
          const reason = (await response.text().catch(() => '')).slice(0, MAX_REASON_CHARS)
          console.warn('push no enviado', serviceOf(subscription.endpoint), response.status, reason)
        }
        return result
      } catch (error) {
        console.warn('push con error de red', serviceOf(subscription.endpoint), error instanceof Error ? error.name : '')
        return 'retry'
      }
    },
  }
}
