import { randomId, randomToken, sha256Hex } from './auth'
import { HttpError } from './http'
import type { CreateInput, InviteInput, JoinInput, RecordInput } from './roomInput'
import type { Member, Role, RoomKind, RoomMeta, RoomStore } from './roomStore'

const HOUR_MS = 60 * 60 * 1000
const DAY_MS = 24 * HOUR_MS

export const PAGE_SIZE = 1000
export const MAX_RECORDS = 20_000
export const MAX_MEMBERS = 50
export const MAX_LIVE_INVITES = 20
export const TOMBSTONE_KEEP_MS = 180 * DAY_MS
/** Podar mueve de sitio lo antiguo (ver `prune`) y todos lo reciben otra vez: mejor de tarde en tarde. */
export const PRUNE_EVERY_MS = 30 * DAY_MS
export const ROOM_IDLE_MS = 365 * DAY_MS
export const TOUCH_EVERY_MS = DAY_MS
export const SEEN_EVERY_MS = HOUR_MS
const MEMBER_ID_BYTES = 6

export interface RecordOut {
  k: string
  v: string
  d: 0 | 1
  s: number
}

export interface Page {
  recs: RecordOut[]
  seq: number
  more: boolean
  reset: boolean
}

export interface Written {
  recs: RecordOut[]
  seq: number
}

export interface MemberView {
  id: string
  role: Role
  name: string
  created: number
  seen: number
  you: boolean
}

export interface Removal {
  kicked: string
  /** Sin miembros: la sala ya no existe. */
  destroyed: boolean
}

export interface RoomIds {
  token(): string
  member(): string
}

const defaultIds: RoomIds = { token: randomToken, member: () => randomId(MEMBER_ID_BYTES) }

const out = ({ k, v, d, s }: RecordOut): RecordOut => ({ k, v, d, s })

const notFound = () => new HttpError(404, 'la sala no existe')

/** Una sala: sus miembros, sus invitaciones y sus registros cifrados. No lee nada de lo que guarda. */
export class RoomCore {
  constructor(
    private readonly store: RoomStore,
    private readonly ids: RoomIds = defaultIds,
  ) {}

  exists(): boolean {
    return this.store.meta() !== null
  }

  kind(): RoomKind {
    return this.requireMeta().kind
  }

  private requireMeta(): RoomMeta {
    const meta = this.store.meta()
    if (!meta) throw notFound()
    return meta
  }

  private newMember(tokenHash: string, role: Role, name: string, now: number): Member {
    let id = this.ids.member()
    while (this.store.memberById(id)) id = this.ids.member()
    return { id, tokenHash, role, name, created: now, seen: now }
  }

  async create({ kind, name }: CreateInput, now: number): Promise<{ member: string; token: string }> {
    const token = this.ids.token()
    const tokenHash = await sha256Hex(token)
    if (this.exists()) throw new HttpError(409, 'la sala ya existe')
    const member = this.newMember(tokenHash, 'owner', name, now)
    this.store.setMeta({ kind, created: now, seq: 0, count: 0, floor: 0, touched: now, pruned: now })
    this.store.putMember(member)
    return { member: member.id, token }
  }

  /** 404 si la sala no existe; 401 si el token no es de nadie. Apunta `seen` como mucho una vez por hora. */
  async authenticate(token: string | null, now: number): Promise<Member> {
    this.requireMeta()
    const hash = token ? await sha256Hex(token) : null
    const member = hash ? this.store.memberByToken(hash) : null
    if (!member) {
      if (!this.exists()) throw notFound()
      throw new HttpError(401, 'no autorizado')
    }
    if (now - member.seen < SEEN_EVERY_MS) return member
    const seen = { ...member, seen: now }
    this.store.putMember(seen)
    return seen
  }

  /** Sigue siendo miembro (lo pudieron echar con el socket abierto). */
  current(memberId: string): Member | null {
    return this.store.memberById(memberId)
  }

  async createInvite(caller: Member, { ttl, uses }: InviteInput, now: number): Promise<{ invite: string }> {
    const invite = this.ids.token()
    const hash = await sha256Hex(invite)
    this.requireMeta()
    if (caller.role !== 'owner') throw new HttpError(403, 'solo el dueño invita')
    const isAlive = (i: { expires: number; uses: number }) => i.expires > now && i.uses > 0
    const all = this.store.invites()
    for (const dead of all.filter((i) => !isAlive(i))) this.store.deleteInvite(dead.hash)
    if (all.filter(isAlive).length >= MAX_LIVE_INVITES) throw new HttpError(409, 'demasiadas invitaciones vivas')
    this.store.putInvite({ hash, expires: now + ttl * 1000, uses })
    return { invite }
  }

  async join({ invite, name }: JoinInput, now: number): Promise<{ member: string; token: string; kind: RoomKind }> {
    const token = this.ids.token()
    const [inviteHash, tokenHash] = await Promise.all([sha256Hex(invite), sha256Hex(token)])
    const meta = this.requireMeta()
    const found = this.store.invite(inviteHash)
    if (!found || found.expires <= now || found.uses <= 0) throw new HttpError(403, 'invitación no válida')
    if (this.store.members().length >= MAX_MEMBERS) throw new HttpError(409, 'la sala está llena')
    if (found.uses > 1) this.store.putInvite({ ...found, uses: found.uses - 1 })
    else this.store.deleteInvite(found.hash)
    // En la sala de tus dispositivos todos mandan; en una cesta, solo quien la creó.
    const member = this.newMember(tokenHash, meta.kind === 'personal' ? 'owner' : 'member', name, now)
    this.store.putMember(member)
    return { member: member.id, token, kind: meta.kind }
  }

  members(caller: Member): MemberView[] {
    this.requireMeta()
    return this.store.members().map(({ id, role, name, created, seen }) => ({
      id,
      role,
      name,
      created,
      seen,
      you: id === caller.id,
    }))
  }

  remove(caller: Member, targetId: string): Removal {
    const meta = this.requireMeta()
    const target = this.store.memberById(targetId)
    if (!target) throw new HttpError(404, 'ese miembro no está')
    const self = target.id === caller.id
    if (!self && caller.role !== 'owner') throw new HttpError(403, 'solo el dueño puede quitar a otros')
    this.store.deleteMember(target.id)
    const rest = this.store.members()
    if (!rest.length) {
      this.store.wipe()
      return { kicked: target.id, destroyed: true }
    }
    if (meta.kind === 'basket') {
      // A quien echan no debe poder volver con un enlace que ya tuviera.
      if (!self) this.store.clearInvites()
      const [oldest] = rest
      if (oldest && !rest.some((m) => m.role === 'owner')) this.store.putMember({ ...oldest, role: 'owner' })
    }
    return { kicked: target.id, destroyed: false }
  }

  /** Lo posterior a `since`, de `PAGE_SIZE` en `PAGE_SIZE`. Quien venga de antes de lo podado (o de un `seq` que no existe) recibe todo con `reset`. */
  read(since: number): Page {
    const meta = this.requireMeta()
    const reset = since > 0 && (since < meta.floor || since > meta.seq)
    const rows = this.store.recordsAfter(reset ? 0 : since, PAGE_SIZE + 1)
    const more = rows.length > PAGE_SIZE
    const page = more ? rows.slice(0, PAGE_SIZE) : rows
    const last = page[page.length - 1]
    return { recs: page.map(out), seq: more && last ? last.s : meta.seq, more, reset }
  }

  write(recs: readonly RecordInput[], now: number): Written {
    const meta = this.requireMeta()
    if (!recs.length) return { recs: [], seq: meta.seq }
    // Si una clave viene dos veces, vale la última.
    const latest = new Map<string, RecordInput>()
    for (const rec of recs) {
      latest.delete(rec.k)
      latest.set(rec.k, rec)
    }
    const fresh = [...latest.keys()].filter((k) => !this.store.hasRecord(k)).length
    if (meta.count + fresh > MAX_RECORDS) throw new HttpError(507, 'la sala está llena')
    let seq = meta.seq
    const written = [...latest.values()].map((rec) => {
      seq += 1
      const stored = { ...rec, s: seq, at: now }
      this.store.putRecord(stored)
      return out(stored)
    })
    this.store.setMeta({ ...meta, seq, count: meta.count + fresh })
    return { recs: written, seq }
  }

  /**
   * Apunta la actividad (como mucho una vez al día) y, de tarde en tarde, poda. Devuelve la hora a la que
   * hay que reprogramar la alarma que borra la sala, o `null` si no toca.
   */
  touch(now: number): number | null {
    const meta = this.store.meta()
    if (!meta || now - meta.touched < TOUCH_EVERY_MS) return null
    const touched = { ...meta, touched: now }
    this.store.setMeta(now - meta.pruned >= PRUNE_EVERY_MS ? this.prune(touched, now) : touched)
    return now + ROOM_IDLE_MS
  }

  /**
   * Borra las lápidas de más de 180 días. Lo que queda por debajo de la mayor borrada pasa por encima de todo
   * (`s + seq`, en el mismo orden): así ningún registro queda por debajo de `floor` y quien pide por páginas
   * tras un `reset` no vuelve a caer en otro. El precio: todos reciben otra vez esos registros, por eso se
   * poda como mucho cada `PRUNE_EVERY_MS`.
   */
  private prune(meta: RoomMeta, now: number): RoomMeta {
    const { count, maxSeq } = this.store.deleteTombstonesBefore(now - TOMBSTONE_KEEP_MS)
    if (!count) return { ...meta, pruned: now }
    const floor = Math.max(meta.floor, maxSeq)
    this.store.shiftSeqBelow(floor, meta.seq)
    return { ...meta, pruned: now, floor, seq: meta.seq + floor, count: meta.count - count }
  }

  /** Cuándo debe saltar la alarma que la borra; `null` si ya no existe. */
  alarmAt(): number | null {
    const meta = this.store.meta()
    return meta ? meta.touched + ROOM_IDLE_MS : null
  }

  /** Un año sin que nadie la abra (o ya borrada). */
  expired(now: number): boolean {
    const at = this.alarmAt()
    return at === null || now >= at
  }

  /** Borra todo (la alarma del año). */
  destroy(): void {
    this.store.wipe()
  }
}
