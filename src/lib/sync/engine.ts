import { del, get, set } from 'idb-keyval'
import type { RoomLink } from '../../types'
import { socketUrl } from './api'
import { recordId, roomKeys, seal, unseal } from './crypto'
import type { RoomKeys } from './crypto'
import type { Fields, SyncChange } from './records'
import { Replica } from './replica'
import type { ReplicaSnapshot } from './replica'
import { isLive, parseStamped } from './stamp'
import type { Stamped } from './stamp'

export type SyncStatus = 'connecting' | 'online' | 'offline'

/** Por qué se cierra una sala para siempre: ya no eres miembro (4003, 4001) o ya no existe (4004). */
export type GoneReason = 'removed' | 'missing'

export interface RoomSyncOptions {
  base: string
  link: RoomLink
  /** Con qué hora se sella lo que ya hay si no se guardó nada de la sala (1 al entrar en un grupo que existe). */
  initialT?: number | null
  apply: (changes: SyncChange[]) => void
  onStatus?: (status: SyncStatus) => void
  onGone?: (reason: GoneReason) => void
}

interface WireRecord {
  k: string
  v: string
  d: 0 | 1
  s?: number
}

const PUT_CHUNK = 200
const PING_MS = 25_000
const SAVE_DELAY_MS = 600
const MAX_BACKOFF_MS = 30_000
/** Al volver a la app, si el socket no contesta en este rato se da por muerto (iOS los deja así al suspender). */
const PONG_TIMEOUT_MS = 5000

const storeKey = (room: string) => `tasks:sync:${room}`

export const forgetRoom = (room: string): Promise<void> => del(storeKey(room)).catch(() => undefined)

/**
 * Una sala abierta: la réplica de este dispositivo, cifrada hacia el servidor y conectada por WebSocket
 * mientras la app está abierta. Se reconecta sola al volver la red o la app.
 */
export class RoomSync {
  private replica: Replica | null = null
  private keys: RoomKeys | null = null
  private socket: WebSocket | null = null
  private records: ReadonlyMap<string, Fields> | null = null
  private status: SyncStatus = 'offline'
  private stopped = false
  private ready = false
  private backoff = 1000
  private retry: ReturnType<typeof setTimeout> | undefined
  private ping: ReturnType<typeof setInterval> | undefined
  private saveTimer: ReturnType<typeof setTimeout> | undefined
  private pongTimer: ReturnType<typeof setTimeout> | undefined
  private putId = 0
  private readonly inflight = new Map<number, { key: string; version: number }[]>()
  private readonly ids = new Map<string, string>()
  /** Lo que llega se descifra en orden: una cola de promesas. */
  private queue: Promise<void> = Promise.resolve()
  private resetKeys: Set<string> | null = null

  constructor(private readonly options: RoomSyncOptions) {}

  async start(): Promise<void> {
    const snapshot = (await get<ReplicaSnapshot>(storeKey(this.options.link.room)).catch(() => undefined)) ?? null
    this.keys = await roomKeys(this.options.link.key)
    if (this.stopped) return
    this.replica = new Replica(snapshot, snapshot ? null : (this.options.initialT ?? null))
    if (this.records) this.replica.local(this.records)
    window.addEventListener('online', this.wake)
    document.addEventListener('visibilitychange', this.onVisibility)
    this.connect()
  }

  /** El estado ha cambiado: lo de aquí se sella y se sube. */
  update(records: ReadonlyMap<string, Fields>): void {
    this.records = records
    if (!this.replica) return
    if (this.replica.local(records)) {
      this.scheduleSave()
      this.flush()
    }
  }

  /**
   * `persist`: guardar lo que se sabe de la sala para la próxima vez. Al salir de ella (o si te echan) no: lo
   * que hay se olvida y no debe quedar escrito después.
   */
  stop(persist = true): void {
    const wasStopped = this.stopped
    this.stopped = true
    clearTimeout(this.retry)
    clearTimeout(this.saveTimer)
    clearTimeout(this.pongTimer)
    clearInterval(this.ping)
    window.removeEventListener('online', this.wake)
    document.removeEventListener('visibilitychange', this.onVisibility)
    this.socket?.close(1000)
    this.socket = null
    if (persist && !wasStopped) void this.save(true)
  }

  private setStatus(status: SyncStatus) {
    if (status === this.status) return
    this.status = status
    this.options.onStatus?.(status)
  }

  private readonly wake = () => {
    if (this.stopped || this.socket) return
    clearTimeout(this.retry)
    this.backoff = 1000
    this.connect()
  }

  private readonly onVisibility = () => {
    if (document.visibilityState !== 'visible') {
      void this.save()
      return
    }
    const socket = this.socket
    if (!socket) return this.wake()
    if (socket.readyState !== WebSocket.OPEN) {
      socket.close()
      return
    }
    // Abierto en apariencia: si no contesta, se cierra y `onclose` reconecta.
    socket.send('{"t":"ping"}')
    clearTimeout(this.pongTimer)
    this.pongTimer = setTimeout(() => socket.close(4000), PONG_TIMEOUT_MS)
  }

  private connect() {
    if (this.stopped || !this.replica) return
    this.setStatus('connecting')
    this.ready = false
    // Lo que llega hasta `ready` es ponerse al día: si el servidor dice que es la sala entera, hace falta.
    this.resetKeys = new Set()
    let socket: WebSocket
    try {
      socket = new WebSocket(socketUrl(this.options.base, this.options.link.room))
    } catch {
      this.scheduleRetry()
      return
    }
    this.socket = socket
    socket.onopen = () => {
      socket.send(JSON.stringify({ t: 'auth', token: this.options.link.token, since: this.replica?.seq ?? 0 }))
      clearInterval(this.ping)
      this.ping = setInterval(() => socket.readyState === WebSocket.OPEN && socket.send('{"t":"ping"}'), PING_MS)
    }
    socket.onmessage = (event) => {
      const raw = typeof event.data === 'string' ? event.data : ''
      this.queue = this.queue.then(() => this.onMessage(raw)).catch(() => undefined)
    }
    socket.onclose = (event) => {
      if (this.socket !== socket) return
      this.socket = null
      clearInterval(this.ping)
      clearTimeout(this.pongTimer)
      this.inflight.clear()
      if (event.code === 4001 || event.code === 4003 || event.code === 4004) {
        this.stopped = true
        this.setStatus('offline')
        this.options.onGone?.(event.code === 4004 ? 'missing' : 'removed')
        return
      }
      this.setStatus('offline')
      this.scheduleRetry()
    }
  }

  private scheduleRetry() {
    if (this.stopped) return
    clearTimeout(this.retry)
    // Con la app en segundo plano no se insiste: al volver, `onVisibility` reconecta.
    if (document.visibilityState === 'hidden') return
    this.retry = setTimeout(() => this.connect(), this.backoff)
    this.backoff = Math.min(this.backoff * 2, MAX_BACKOFF_MS)
  }

  private async onMessage(raw: string) {
    let message: Record<string, unknown>
    try {
      message = JSON.parse(raw) as Record<string, unknown>
    } catch {
      return
    }
    const replica = this.replica
    if (!replica || this.stopped) return
    if (message.t === 'pong') {
      clearTimeout(this.pongTimer)
      return
    }
    if (message.t === 'recs' && Array.isArray(message.recs)) {
      const incoming = await this.open(message.recs as WireRecord[])
      if (this.resetKeys) for (const stamped of incoming) this.resetKeys.add(stamped.key)
      const changes = replica.receive(incoming)
      if (typeof message.seq === 'number') replica.seq = Math.max(replica.seq, message.seq)
      if (changes.length) this.options.apply(changes)
      this.scheduleSave()
      if (this.ready) this.flush()
    } else if (message.t === 'ready') {
      if (message.reset === true) replica.reset(this.resetKeys ?? new Set())
      this.resetKeys = null
      // Tras un reset el cursor es el del servidor aunque sea menor (una sala que perdió lo guardado).
      if (typeof message.seq === 'number') replica.seq = message.reset === true ? message.seq : Math.max(replica.seq, message.seq)
      this.ready = true
      this.backoff = 1000
      this.setStatus('online')
      this.flush()
    } else if (message.t === 'error' && typeof message.id === 'number') {
      // El servidor no ha guardado ese lote. Uno mal formado no se reintenta (volvería a fallar igual); uno
      // que no cabe (sala llena) se queda pendiente para la próxima vez.
      const sent = this.inflight.get(message.id)
      this.inflight.delete(message.id)
      if (sent && message.status === 400) replica.ack(sent)
      this.scheduleSave()
    } else if (message.t === 'ack' && typeof message.id === 'number') {
      const sent = this.inflight.get(message.id)
      this.inflight.delete(message.id)
      if (sent) replica.ack(sent)
      if (typeof message.seq === 'number') replica.seq = Math.max(replica.seq, message.seq)
      this.scheduleSave()
    }
  }

  private async open(recs: readonly WireRecord[]): Promise<Stamped[]> {
    const keys = this.keys
    if (!keys) return []
    const out: Stamped[] = []
    for (const rec of recs) {
      if (!rec || typeof rec.k !== 'string' || typeof rec.v !== 'string') continue
      const stamped = parseStamped(await unseal(keys.enc, rec.v))
      // Un registro cuyo id no es el de su clave lógica no se acepta: alguien lo ha cambiado de sitio.
      if (stamped && (await this.idOf(stamped.key)) === rec.k) out.push(stamped)
    }
    return out
  }

  private async idOf(key: string): Promise<string> {
    const known = this.ids.get(key)
    if (known) return known
    const id = await recordId(this.keys!, key)
    this.ids.set(key, id)
    return id
  }

  /** Sube lo pendiente que no está ya en camino. */
  private flush() {
    const replica = this.replica
    const socket = this.socket
    if (!replica || !socket || !this.ready || socket.readyState !== WebSocket.OPEN) return
    const busy = new Set([...this.inflight.values()].flat().map((item) => `${item.key}#${item.version}`))
    const pending = replica.pending().filter((item) => !busy.has(`${item.stamped.key}#${item.version}`))
    if (!pending.length) return
    this.queue = this.queue.then(() => this.send(socket, pending)).catch(() => undefined)
  }

  private async send(socket: WebSocket, pending: ReturnType<Replica['pending']>) {
    const keys = this.keys
    if (!keys) return
    for (let at = 0; at < pending.length; at += PUT_CHUNK) {
      const chunk = pending.slice(at, at + PUT_CHUNK)
      const recs: WireRecord[] = []
      for (const { stamped } of chunk) {
        recs.push({ k: await this.idOf(stamped.key), v: await seal(keys.enc, stamped), d: isLive(stamped) ? 0 : 1 })
      }
      if (socket.readyState !== WebSocket.OPEN) return
      const id = ++this.putId
      this.inflight.set(id, chunk.map((item) => ({ key: item.stamped.key, version: item.version })))
      socket.send(JSON.stringify({ t: 'put', id, recs }))
    }
  }

  private scheduleSave() {
    if (this.stopped) return
    clearTimeout(this.saveTimer)
    this.saveTimer = setTimeout(() => void this.save(), SAVE_DELAY_MS)
  }

  private async save(final = false) {
    clearTimeout(this.saveTimer)
    if (!this.replica || (this.stopped && !final)) return
    await set(storeKey(this.options.link.room), this.replica.snapshot()).catch(() => undefined)
  }
}
