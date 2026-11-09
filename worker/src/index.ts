import { handle } from './app'
import type { Env } from './env'
import { FEEDBACK_KEEP_MS } from './app'
import { depsFrom, reason, schedulerStub } from './env'
import { statsCutoff, utcDay } from './stats'

export { Scheduler } from './scheduler'

/** El panel de uso: ficheros estáticos de `panel/` (página, código y capturas), sin datos dentro. */
const PANEL = /^\/uso(?:\/|$)/
const PANEL_CSP = [
  "default-src 'none'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' blob: data:",
  "connect-src 'self'",
  "manifest-src 'self'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'",
].join('; ')

async function panelAsset(request: Request, env: Env): Promise<Response> {
  const asset = await env.ASSETS.fetch(request)
  const headers = new Headers(asset.headers)
  headers.set('content-security-policy', PANEL_CSP)
  // Revalida siempre: tras desplegar, el panel nuevo llega sin esperar a que caduque nada.
  headers.set('cache-control', 'no-cache')
  headers.set('referrer-policy', 'no-referrer')
  headers.set('x-content-type-options', 'nosniff')
  headers.set('x-robots-tag', 'noindex')
  return new Response(asset.body, { status: asset.status, statusText: asset.statusText, headers })
}

/** La limpieza de estadísticas basta una vez al día: el cron corre cada 5 minutos. */
const isDailySlot = (at: Date) => at.getUTCHours() === 4 && at.getUTCMinutes() < 5

export default {
  async fetch(request, env) {
    const { pathname } = new URL(request.url)
    if (PANEL.test(pathname) && (request.method === 'GET' || request.method === 'HEAD')) return panelAsset(request, env)
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
  async scheduled(controller, env, ctx) {
    const run = async () => {
      try {
        const deps = depsFrom(env)
        const next = await deps.store.nextDueAt()
        if (next !== null) await schedulerStub(env).arm(next)
        // Las sugerencias que nadie archivó en un año se van solas, aunque no llegue ninguna nueva.
        await deps.store.deleteFeedbackBefore(deps.now() - FEEDBACK_KEEP_MS)
        if (isDailySlot(new Date(controller.scheduledTime))) {
          await deps.store.deleteStatsBefore(statsCutoff(deps.now()), utcDay(deps.now()))
        }
      } catch (error) {
        console.error('cron fallido:', reason(error))
      }
    }
    ctx.waitUntil(run())
  },
} satisfies ExportedHandler<Env>
