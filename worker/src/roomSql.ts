import type { Member, RoomStore, StoredRecord } from './roomStore'

/** El almacenamiento de una sala sobre el SQLite del Durable Object. Se prueba con `wrangler dev`. */

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS meta (id INTEGER PRIMARY KEY CHECK (id = 1), kind TEXT NOT NULL, created INTEGER NOT NULL,
     seq INTEGER NOT NULL, count INTEGER NOT NULL, floor INTEGER NOT NULL, touched INTEGER NOT NULL,
     pruned INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS members (id TEXT PRIMARY KEY, token TEXT NOT NULL UNIQUE, role TEXT NOT NULL,
     name TEXT NOT NULL, created INTEGER NOT NULL, seen INTEGER NOT NULL)`,
  'CREATE TABLE IF NOT EXISTS invites (hash TEXT PRIMARY KEY, expires INTEGER NOT NULL, uses INTEGER NOT NULL)',
  `CREATE TABLE IF NOT EXISTS records (k TEXT PRIMARY KEY, v TEXT NOT NULL, d INTEGER NOT NULL, s INTEGER NOT NULL,
     at INTEGER NOT NULL)`,
  'CREATE INDEX IF NOT EXISTS records_s ON records (s)',
]

type Row = Record<string, SqlStorageValue>

const toMember = (r: Row): Member => ({
  id: String(r.id),
  tokenHash: String(r.token),
  role: r.role === 'owner' ? 'owner' : 'member',
  name: String(r.name),
  created: Number(r.created),
  seen: Number(r.seen),
})

const toRecord = (r: Row): StoredRecord => ({
  k: String(r.k),
  v: String(r.v),
  d: r.d === 1 ? 1 : 0,
  s: Number(r.s),
  at: Number(r.at),
})

const MEMBER_COLUMNS = 'id, token, role, name, created, seen'

/** El SQLite del Durable Object (`ctx.storage.sql`). */
export function sqlRoomStore(sql: SqlStorage): RoomStore {
  for (const statement of SCHEMA) sql.exec(statement)
  const rows = (query: string, ...bindings: unknown[]) => sql.exec<Row>(query, ...bindings).toArray()

  return {
    meta() {
      const [r] = rows('SELECT kind, created, seq, count, floor, touched, pruned FROM meta WHERE id = 1')
      if (!r) return null
      return {
        kind: r.kind === 'basket' ? 'basket' : 'personal',
        created: Number(r.created),
        seq: Number(r.seq),
        count: Number(r.count),
        floor: Number(r.floor),
        touched: Number(r.touched),
        pruned: Number(r.pruned),
      }
    },
    setMeta: (m) =>
      void sql.exec(
        'INSERT OR REPLACE INTO meta (id, kind, created, seq, count, floor, touched, pruned) VALUES (1, ?, ?, ?, ?, ?, ?, ?)',
        m.kind,
        m.created,
        m.seq,
        m.count,
        m.floor,
        m.touched,
        m.pruned,
      ),
    members: () => rows(`SELECT ${MEMBER_COLUMNS} FROM members ORDER BY created, rowid`).map(toMember),
    memberById: (id) => rows(`SELECT ${MEMBER_COLUMNS} FROM members WHERE id = ?`, id).map(toMember)[0] ?? null,
    memberByToken: (hash) => rows(`SELECT ${MEMBER_COLUMNS} FROM members WHERE token = ?`, hash).map(toMember)[0] ?? null,
    putMember: (m) =>
      void sql.exec(
        `INSERT INTO members (${MEMBER_COLUMNS}) VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT (id) DO UPDATE SET token = excluded.token, role = excluded.role, name = excluded.name, seen = excluded.seen`,
        m.id,
        m.tokenHash,
        m.role,
        m.name,
        m.created,
        m.seen,
      ),
    deleteMember: (id) => void sql.exec('DELETE FROM members WHERE id = ?', id),
    invites: () =>
      rows('SELECT hash, expires, uses FROM invites').map((r) => ({
        hash: String(r.hash),
        expires: Number(r.expires),
        uses: Number(r.uses),
      })),
    invite(hash) {
      const [r] = rows('SELECT hash, expires, uses FROM invites WHERE hash = ?', hash)
      return r ? { hash: String(r.hash), expires: Number(r.expires), uses: Number(r.uses) } : null
    },
    putInvite: (i) => void sql.exec('INSERT OR REPLACE INTO invites (hash, expires, uses) VALUES (?, ?, ?)', i.hash, i.expires, i.uses),
    deleteInvite: (hash) => void sql.exec('DELETE FROM invites WHERE hash = ?', hash),
    clearInvites: () => void sql.exec('DELETE FROM invites'),
    hasRecord: (k) => rows('SELECT 1 AS x FROM records WHERE k = ?', k).length > 0,
    putRecord: (r) =>
      void sql.exec('INSERT OR REPLACE INTO records (k, v, d, s, at) VALUES (?, ?, ?, ?, ?)', r.k, r.v, r.d, r.s, r.at),
    recordsAfter: (since, limit) =>
      rows('SELECT k, v, d, s, at FROM records WHERE s > ? ORDER BY s LIMIT ?', since, limit).map(toRecord),
    deleteTombstonesBefore(before) {
      const [r] = rows('SELECT MAX(s) AS m, COUNT(*) AS n FROM records WHERE d = 1 AND at < ?', before)
      const count = Number(r?.n ?? 0)
      if (count) sql.exec('DELETE FROM records WHERE d = 1 AND at < ?', before)
      return { count, maxSeq: Number(r?.m ?? 0) }
    },
    shiftSeqBelow: (below, offset) => void sql.exec('UPDATE records SET s = s + ? WHERE s < ?', offset, below),
    wipe() {
      for (const table of ['meta', 'members', 'invites', 'records']) sql.exec(`DELETE FROM ${table}`)
    },
  }
}
