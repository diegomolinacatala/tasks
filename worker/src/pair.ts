import { DurableObject } from 'cloudflare:workers'
import type { Env } from './env'
import { handlePairHttp, type PairState, type PairStore } from './pairCore'

const KEY = 'pair'

/** Un emparejamiento: vive 10 minutos y la alarma lo borra. */
export class Pairing extends DurableObject<Env> {
  private readonly store: PairStore = {
    get: async () => (await this.ctx.storage.get<PairState>(KEY)) ?? null,
    put: (state) => this.ctx.storage.put(KEY, state),
  }

  async fetch(request: Request): Promise<Response> {
    const outcome = await handlePairHttp(this.store, request, Date.now())
    if (outcome.alarm !== undefined) await this.ctx.storage.setAlarm(outcome.alarm)
    return outcome.response
  }

  async alarm(): Promise<void> {
    await this.ctx.storage.deleteAll()
  }
}
