import { buildPushPayload, type VapidKeys } from '@block65/webcrypto-web-push'
import type { PushResult, Sender, Subscription } from './types'

const TTL_SECONDS = 60 * 60
const TOPIC_MAX = 32

export function classify(status: number): PushResult {
  if (status >= 200 && status < 300) return 'sent'
  if (status === 404 || status === 410) return 'gone'
  // Apple responde 403 BadJwtToken si el subject o las claves VAPID no son válidos.
  if (status === 401 || status === 403) return 'unauthorized'
  if (status === 400 || status === 413) return 'rejected'
  return 'retry'
}

/** Envío real con Web Push (RFC 8291 + VAPID) sobre WebCrypto. */
export function webPushSender(vapid: VapidKeys): Sender {
  return {
    async send(subscription: Subscription, data: string, topic?: string): Promise<PushResult> {
      try {
        const safeTopic = topic?.replace(/[^A-Za-z0-9_-]/g, '').slice(0, TOPIC_MAX)
        const payload = await buildPushPayload(
          {
            data,
            // `topic` hace que un reintento sustituya al aviso anterior en vez de duplicarlo.
            options: { ttl: TTL_SECONDS, urgency: 'high', ...(safeTopic ? { topic: safeTopic } : {}) },
          },
          { ...subscription, expirationTime: null },
          vapid,
        )
        const response = await fetch(subscription.endpoint, payload)
        return classify(response.status)
      } catch {
        return 'retry'
      }
    },
  }
}
