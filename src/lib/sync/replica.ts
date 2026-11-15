import type { Fields, SyncChange } from './records'
import { Clock, isLive, maxT, merge, sameFields, sameStamped, stampLocal, valueOf } from './stamp'
import type { Stamped } from './stamp'

/** Lo que se guarda de una sala en este dispositivo para seguir donde se dejó. */
export interface ReplicaSnapshot {
  /** Hasta qué escritura del servidor se ha leído. */
  seq: number
  clock: number
  stamped: Record<string, Stamped>
  /** Registros que aún no ha confirmado el servidor. */
  outbox: string[]
}

export interface Outgoing {
  stamped: Stamped
  version: number
}

/**
 * La copia de una sala en este dispositivo, sin red ni cifrado (eso es `engine.ts`): sabe qué ha cambiado
 * aquí, mezcla lo que llega y decide qué hay que subir. Pura y síncrona, para poder probarla entera.
 */
export class Replica {
  seq: number
  private readonly clock: Clock
  private readonly stamped: Map<string, Stamped>
  /** Lo que tenía el estado la última vez que se miró. */
  private known: Map<string, Fields> | null = null
  /** Lo que se ha mandado aplicar desde fuera y aún no se ha visto en el estado. */
  private readonly expected = new Map<string, Fields | null>()
  private readonly outbox = new Map<string, number>()
  private version = 0

  /**
   * `initialT`: con qué hora se sella lo que ya hay la primera vez, si no hay nada guardado de la sala. Al
   * entrar en un grupo que ya existe es 1, la más antigua: lo de los vinculados manda.
   */
  constructor(
    snapshot: ReplicaSnapshot | null,
    private readonly initialT: number | null = null,
    now: () => number = Date.now,
  ) {
    this.seq = snapshot?.seq ?? 0
    this.clock = new Clock(snapshot?.clock ?? 0, now)
    this.stamped = new Map(Object.entries(snapshot?.stamped ?? {}))
    for (const key of snapshot?.outbox ?? []) this.outbox.set(key, ++this.version)
    if (snapshot) {
      this.known = new Map()
      for (const [key, stamped] of this.stamped) {
        const value = valueOf(stamped)
        if (value) this.known.set(key, value)
      }
    }
  }

  /** Mira el estado: lo que cambió aquí se sella y queda por subir. Devuelve si hay algo nuevo que subir. */
  local(records: ReadonlyMap<string, Fields>): boolean {
    const first = this.known === null
    const known = this.known ?? new Map<string, Fields>()
    const t = first && this.initialT !== null ? this.initialT : null
    let grew = false
    const touch = (key: string, value: Fields | null) => {
      const expected = this.expected.get(key)
      if (this.expected.has(key)) {
        this.expected.delete(key)
        if (sameFields(expected, value)) return
      }
      const prev = this.stamped.get(key)
      const next = stampLocal(prev, key, value, t ?? this.clock.tick())
      if (!next || next === prev) return
      this.stamped.set(key, next)
      this.outbox.set(key, ++this.version)
      grew = true
    }
    for (const [key, value] of records) {
      const before = known.get(key)
      if (before === value || (before && sameFields(before, value))) continue
      touch(key, value)
    }
    for (const key of known.keys()) if (!records.has(key)) touch(key, null)
    this.known = new Map(records)
    return grew
  }

  /** Mezcla lo que llega de la sala; devuelve lo que hay que aplicar al estado. */
  receive(incoming: readonly Stamped[]): SyncChange[] {
    const changes: SyncChange[] = []
    for (const remote of incoming) {
      this.clock.observe(Math.max(maxT(remote), remote.x?.t ?? 0))
      const local = this.stamped.get(remote.key)
      const merged = merge(local, remote)
      if (local && sameStamped(merged, local)) continue
      this.stamped.set(remote.key, merged)
      // Aquí se sabía algo que el otro no: vuelve a subir la mezcla.
      if (!sameStamped(merged, remote)) this.outbox.set(remote.key, ++this.version)
      const before = valueOf(local)
      const after = valueOf(merged)
      if (sameFields(before, after)) continue
      changes.push({ key: remote.key, value: after })
      this.expected.set(remote.key, after)
    }
    return changes
  }

  /**
   * El servidor podó lápidas viejas y ha mandado la sala entera: lo borrado que no está ya se olvida, y lo
   * vivo que no conoce se vuelve a subir.
   */
  reset(received: ReadonlySet<string>): void {
    for (const [key, stamped] of [...this.stamped]) {
      if (received.has(key)) continue
      if (isLive(stamped)) this.outbox.set(key, ++this.version)
      else {
        this.stamped.delete(key)
        this.outbox.delete(key)
      }
    }
  }

  pending(): Outgoing[] {
    return [...this.outbox].flatMap(([key, version]) => {
      const stamped = this.stamped.get(key)
      return stamped ? [{ stamped, version }] : []
    })
  }

  /** Lo subido y confirmado; lo que cambió mientras tanto sigue pendiente. */
  ack(sent: readonly { key: string; version: number }[]): void {
    for (const { key, version } of sent) if (this.outbox.get(key) === version) this.outbox.delete(key)
  }

  get hasPending(): boolean {
    return this.outbox.size > 0
  }

  snapshot(): ReplicaSnapshot {
    return { seq: this.seq, clock: this.clock.value, stamped: Object.fromEntries(this.stamped), outbox: [...this.outbox.keys()] }
  }
}
