import { handle } from './app'
import { runDue } from './cron'
import { webPushSender } from './push'
import { d1Store } from './store'
import type { Deps, Limiter } from './types'
import { isValidVapidSubject } from './validate'

export interface Env {
  DB: D1Database
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

const limiterOf = (binding: RateLimit): Limiter => ({
  allow: async (key) => (await binding.limit({ key })).success,
})

function depsFrom(env: Env): Deps {
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
    config: {
      allowedOrigins: env.ALLOWED_ORIGINS.split(',').map((origin) => origin.trim()).filter(Boolean),
      vapidPublicKey: env.VAPID_PUBLIC_KEY,
      ipSalt: env.IP_HASH_SALT,
    },
    now: () => Date.now(),
  }
}

const reason = (error: unknown) => (error instanceof Error ? error.message : 'desconocido')

export default {
  async fetch(request, env) {
    try {
      return await handle(request, depsFrom(env))
    } catch (error) {
      console.error('Configuración inválida:', reason(error))
      return new Response(JSON.stringify({ error: 'servicio mal configurado' }), {
        status: 500,
        headers: { 'content-type': 'application/json' },
      })
    }
  },

  async scheduled(_controller, env, ctx) {
    const run = async () => {
      try {
        const summary = await runDue(depsFrom(env))
        if (summary.unauthorized) console.error('cron: VAPID rechazado, revisa la configuración', summary)
        else if (summary.sent || summary.late || summary.dropped || summary.gone) console.info('cron', summary)
      } catch (error) {
        // Sin esto, un secret roto o un fallo de D1 dejaría de enviar avisos sin rastro.
        console.error('cron fallido:', reason(error))
      }
    }
    ctx.waitUntil(run())
  },
} satisfies ExportedHandler<Env>
