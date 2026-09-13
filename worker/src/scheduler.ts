import { DurableObject } from 'cloudflare:workers'
import { planNext, runDue } from './cron'
import type { Env } from './env'
import { depsFrom, reason } from './env'

/**
 * Alarma que despierta el envío a la hora exacta del próximo aviso. Sustituye al cron como
 * mecanismo principal: no depende de que Cloudflare propague los cron triggers.
 * Cloudflare no solapa ejecuciones de `alarm()`, así que un aviso nunca se envía dos veces.
 */
export class Scheduler extends DurableObject<Env> {
  /** Adelanta la alarma si `at` es anterior a la programada. Nunca la retrasa. */
  async arm(at: number): Promise<void> {
    const current = await this.ctx.storage.getAlarm()
    if (current === null || at < current) await this.ctx.storage.setAlarm(at)
  }

  async alarm(): Promise<void> {
    const deps = depsFrom(this.env)
    let summary = { sent: 0, late: 0, retried: 0, dropped: 0, gone: 0, unauthorized: 0 }
    try {
      summary = await runDue(deps)
      if (summary.unauthorized) console.error('avisos: VAPID rechazado, revisa la configuración', summary)
      else console.info('avisos', summary)
    } catch (error) {
      console.error('avisos: ejecución fallida', reason(error))
      summary = { ...summary, retried: 1 }
    }
    const next = planNext(await deps.store.nextDueAt(), deps.now(), summary)
    if (next !== null) await this.ctx.storage.setAlarm(next)
  }
}
