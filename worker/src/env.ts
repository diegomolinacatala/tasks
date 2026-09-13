import { webPushSender } from './push'
import { d1Store } from './store'
import type { Deps, Limiter } from './types'
import { isValidVapidSubject } from './validate'

export interface Env {
  DB: D1Database
  SCHEDULER: DurableObjectNamespace<import('./scheduler').Scheduler>
  IP_LIMITER: RateLimit
  DEVICE_LIMITER: RateLimit
  TEST_LIMITER: RateLimit
  ALLOWED_ORIGINS: string
  VAPID_PUBLIC_KEY: string
  VAPID_PRIVATE_KEY: string
  VAPID_SUBJECT: string
  IP_HASH_SALT: string
}

const SECRETS = ['VAPID_PUBLIC_KEY', 'VAPID_PRIVATE_KEY', 'VAPID_SUBJECT', 'IP_HASH_SALT'] as const

/** Una sola alarma global: la app es de una persona y así los envíos nunca se solapan. */
const SCHEDULER_NAME = 'global'

const limiterOf = (binding: RateLimit): Limiter => ({
  allow: async (key) => (await binding.limit({ key })).success,
})

export const schedulerStub = (env: Env) => env.SCHEDULER.get(env.SCHEDULER.idFromName(SCHEDULER_NAME))

export function depsFrom(env: Env): Deps {
  const missing = SECRETS.filter((key) => !env[key])
  if (missing.length) throw new Error(`Faltan secrets: ${missing.join(', ')}`)
  if (!isValidVapidSubject(env.VAPID_SUBJECT)) {
    throw new Error('VAPID_SUBJECT debe ser mailto: o https:// con un dominio real')
  }
  return {
    store: d1Store(env.DB),
    sender: webPushSender({
      subject: env.VAPID_SUBJECT,
      publicKey: env.VAPID_PUBLIC_KEY,
      privateKey: env.VAPID_PRIVATE_KEY,
    }),
    limits: {
      ip: limiterOf(env.IP_LIMITER),
      device: limiterOf(env.DEVICE_LIMITER),
      test: limiterOf(env.TEST_LIMITER),
    },
    scheduler: { arm: (at) => schedulerStub(env).arm(at) },
    config: {
      allowedOrigins: env.ALLOWED_ORIGINS.split(',').map((origin) => origin.trim()).filter(Boolean),
      vapidPublicKey: env.VAPID_PUBLIC_KEY,
      ipSalt: env.IP_HASH_SALT,
    },
    now: () => Date.now(),
  }
}

export const reason = (error: unknown) => (error instanceof Error ? error.message : 'desconocido')
