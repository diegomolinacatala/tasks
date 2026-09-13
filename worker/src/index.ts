import { handle } from './app'
import type { Env } from './env'
import { depsFrom, reason, schedulerStub } from './env'

export { Scheduler } from './scheduler'

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

  // Red de seguridad: si la alarma se perdiera, el cron la vuelve a armar. No envía nada él
  // mismo, para que todos los envíos pasen por la alarma y no haya duplicados.
  async scheduled(_controller, env, ctx) {
    const run = async () => {
      try {
        const deps = depsFrom(env)
        const next = await deps.store.nextDueAt()
        if (next !== null) await schedulerStub(env).arm(next)
      } catch (error) {
        console.error('cron fallido:', reason(error))
      }
    }
    ctx.waitUntil(run())
  },
} satisfies ExportedHandler<Env>
