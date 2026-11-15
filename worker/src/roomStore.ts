/**
 * Almacenamiento de una sala. Síncrono a propósito: el SQLite de un Durable Object lo es, y así cada
 * operación lee, comprueba y escribe sin un `await` en medio por el que se cuele otra petición.
 */

export type RoomKind = 'personal' | 'basket'
export type Role = 'owner' | 'member'

export interface RoomMeta {
  kind: RoomKind
  created: number
  /** Último `seq` repartido. */
  seq: number
  /** Registros guardados (lápidas incluidas): llevar la cuenta evita un `COUNT(*)` en cada escritura. */
  count: number
  /** Mayor `seq` de una lápida podada: quien venga de antes recibe `reset`. */
  floor: number
  /** Última actividad apuntada (como mucho una vez al día): de ella cuelga la alarma del año. */
  touched: number
  /** Última poda de lápidas. */
  pruned: number
}

export interface Member {
  id: string
  tokenHash: string
  role: Role
  /** Nombre cifrado en el móvil. */
  name: string
  created: number
  seen: number
}

export interface Invite {
  hash: string
  expires: number
  uses: number
}

export interface StoredRecord {
  k: string
  v: string
  d: 0 | 1
  s: number
  /** Cuándo se escribió: las lápidas se podan por antigüedad. */
  at: number
}

export interface RoomStore {
  meta(): RoomMeta | null
  setMeta(meta: RoomMeta): void
  /** Los más antiguos primero. */
  members(): Member[]
  memberById(id: string): Member | null
  memberByToken(tokenHash: string): Member | null
  putMember(member: Member): void
  deleteMember(id: string): void
  invites(): Invite[]
  invite(hash: string): Invite | null
  putInvite(invite: Invite): void
  deleteInvite(hash: string): void
  clearInvites(): void
  hasRecord(k: string): boolean
  putRecord(record: StoredRecord): void
  /** Los de `s > since`, por `s`, como mucho `limit`. */
  recordsAfter(since: number, limit: number): StoredRecord[]
  /** Borra las lápidas escritas antes de `before`: cuántas y el mayor `s` borrado (0 si ninguna). */
  deleteTombstonesBefore(before: number): { count: number; maxSeq: number }
  /** Suma `offset` al `s` de los registros con `s < below`. */
  shiftSeqBelow(below: number, offset: number): void
  wipe(): void
}

/** La misma semántica que SQLite, en memoria: para los tests. */
export function memoryRoomStore(): RoomStore {
  let meta: RoomMeta | null = null
  const members = new Map<string, Member>()
  const invites = new Map<string, Invite>()
  const records = new Map<string, StoredRecord>()

  return {
    meta: () => meta,
    setMeta: (next) => void (meta = next),
    members: () => [...members.values()].sort((a, b) => a.created - b.created),
    memberById: (id) => members.get(id) ?? null,
    memberByToken: (hash) => [...members.values()].find((m) => m.tokenHash === hash) ?? null,
    putMember: (member) => void members.set(member.id, member),
    deleteMember: (id) => void members.delete(id),
    invites: () => [...invites.values()],
    invite: (hash) => invites.get(hash) ?? null,
    putInvite: (invite) => void invites.set(invite.hash, invite),
    deleteInvite: (hash) => void invites.delete(hash),
    clearInvites: () => invites.clear(),
    hasRecord: (k) => records.has(k),
    putRecord: (record) => void records.set(record.k, record),
    recordsAfter: (since, limit) =>
      [...records.values()]
        .filter((r) => r.s > since)
        .sort((a, b) => a.s - b.s)
        .slice(0, limit),
    deleteTombstonesBefore(before) {
      let maxSeq = 0
      let count = 0
      for (const [k, r] of records) {
        if (r.d === 1 && r.at < before) {
          maxSeq = Math.max(maxSeq, r.s)
          count += 1
          records.delete(k)
        }
      }
      return { count, maxSeq }
    },
    shiftSeqBelow(below, offset) {
      for (const [k, r] of records) if (r.s < below) records.set(k, { ...r, s: r.s + offset })
    },
    wipe() {
      meta = null
      members.clear()
      invites.clear()
      records.clear()
    },
  }
}
