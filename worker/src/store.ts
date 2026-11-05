import type {
  Device,
  DueItem,
  FeedbackSummary,
  ItemKey,
  NewDevice,
  NewFeedback,
  ScheduleItem,
  StatsBudget,
  StatsHeat,
  StatsRows,
  StatsSummary,
  Store,
  Subscription,
} from './types'

/** D1 admite como mucho 100 parámetros por consulta. */
const MAX_PARAMS = 100

function chunk<T>(items: readonly T[], size: number): T[][] {
  const chunks: T[][] = []
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size))
  return chunks
}

interface DeviceRow {
  id: string
  endpoint: string
  p256dh: string
  auth: string
}

interface FeedbackRow {
  id: string
  at: number
  message: string
  context: string
  has_shot: number
}

interface DueRow extends DeviceRow {
  device_id: string
  item_id: string
  at: number
  payload: string
  attempts: number
}

const subscriptionOf = (row: DeviceRow): Subscription => ({
  endpoint: row.endpoint,
  keys: { p256dh: row.p256dh, auth: row.auth },
})

/** `leading`: parámetros de `sqlPrefix`, que se repiten en cada bloque. */
function keyConditions(
  db: D1Database,
  sqlPrefix: string,
  keys: readonly ItemKey[],
  leading: readonly unknown[] = [],
): D1PreparedStatement[] {
  return chunk(keys, Math.floor((MAX_PARAMS - leading.length) / 2)).map((group) =>
    db
      .prepare(`${sqlPrefix} WHERE ${group.map(() => '(device_id = ? AND id = ?)').join(' OR ')}`)
      .bind(...leading, ...group.flatMap((key) => [key.deviceId, key.id])),
  )
}

/**
 * Las filas van en un solo parámetro JSON que `json_each` desenrolla: una sentencia por tabla, sin el
 * tope de 100 parámetros ni el de consultas por invocación. `WHERE true` evita la ambigüedad de
 * SQLite entre el `ON CONFLICT` del upsert y un join.
 */
const UPSERT_COUNTS = `INSERT INTO stats_counts (day, platform, version, name, events, devices)
  SELECT json_extract(value, '$[0]'), json_extract(value, '$[1]'), json_extract(value, '$[2]'),
         json_extract(value, '$[3]'), json_extract(value, '$[4]'), json_extract(value, '$[5]')
  FROM json_each(?1) WHERE true
  ON CONFLICT (day, platform, version, name)
  DO UPDATE SET events = events + excluded.events, devices = devices + excluded.devices`

const UPSERT_CELLS = `INSERT INTO stats_cells (week, version, screen, cell, taps, rage, dead)
  SELECT json_extract(value, '$[0]'), json_extract(value, '$[1]'), json_extract(value, '$[2]'),
         json_extract(value, '$[3]'), json_extract(value, '$[4]'), json_extract(value, '$[5]'), json_extract(value, '$[6]')
  FROM json_each(?1) WHERE true
  ON CONFLICT (week, version, screen, cell)
  DO UPDATE SET taps = taps + excluded.taps, rage = rage + excluded.rage, dead = dead + excluded.dead`

const UPSERT_TARGETS = `INSERT INTO stats_targets (week, version, screen, target, taps, rage, dead, slow)
  SELECT json_extract(value, '$[0]'), json_extract(value, '$[1]'), json_extract(value, '$[2]'), json_extract(value, '$[3]'),
         json_extract(value, '$[4]'), json_extract(value, '$[5]'), json_extract(value, '$[6]'), json_extract(value, '$[7]')
  FROM json_each(?1) WHERE true
  ON CONFLICT (week, version, screen, target)
  DO UPDATE SET taps = taps + excluded.taps, rage = rage + excluded.rage, dead = dead + excluded.dead, slow = slow + excluded.slow`

/** Suma al presupuesto del día solo si cabe: `changes` dice si se aceptó. */
const SPEND_BUDGET = `INSERT INTO stats_budget (day, rows) VALUES (?1, ?2)
  ON CONFLICT (day) DO UPDATE SET rows = rows + excluded.rows WHERE rows + excluded.rows <= ?3`
const SPEND_IP = `INSERT INTO stats_ip (day, ip, rows) VALUES (?1, ?2, ?3)
  ON CONFLICT (day, ip) DO UPDATE SET rows = rows + excluded.rows WHERE rows + excluded.rows <= ?4`
/** Si el lote no llega a escribirse, lo gastado vuelve: un lote fallido no agota el día. */
const REFUND_BUDGET = `UPDATE stats_budget SET rows = MAX(0, rows - ?2) WHERE day = ?1`
const REFUND_IP = `UPDATE stats_ip SET rows = MAX(0, rows - ?3) WHERE day = ?1 AND ip = ?2`
/** Lo que pinta el panel, acotado: ni con nombres de sobra crece la respuesta sin fin. */
const MAX_NAMES = 600

const PREFIXES_NOW = `substr(name, 1, 2) IN ('e:', 'd:', 'x:')`
const PREFIXES_BEFORE = `substr(name, 1, 2) IN ('e:', 'x:')`
/** Con una versión elegida, también lo que no va por versión (idioma, tema, sesiones…). */
const VERSION_FILTER = `(?3 IS NULL OR version IN (?3, ''))`

const numberOf = (value: unknown) => (typeof value === 'number' ? value : Number(value ?? 0))

async function addStatsRows(db: D1Database, rows: StatsRows, budget: StatsBudget) {
  const total = rows.counts.length + rows.cells.length + rows.targets.length
  if (!total) return true
  const byIp = await db.prepare(SPEND_IP).bind(budget.day, budget.ip, total, budget.ipMax).run()
  if (!byIp.meta.changes) return false
  const spent = await db.prepare(SPEND_BUDGET).bind(budget.day, total, budget.max).run()
  if (!spent.meta.changes) {
    await db.prepare(REFUND_IP).bind(budget.day, budget.ip, total).run()
    return false
  }
  const statements: D1PreparedStatement[] = []
  if (rows.counts.length) {
    const values = rows.counts.map((r) => [r.day, r.platform, r.version, r.name, r.events, r.devices])
    statements.push(db.prepare(UPSERT_COUNTS).bind(JSON.stringify(values)))
  }
  if (rows.cells.length) {
    const values = rows.cells.map((r) => [r.week, r.version, r.screen, r.cell, r.taps, r.rage, r.dead])
    statements.push(db.prepare(UPSERT_CELLS).bind(JSON.stringify(values)))
  }
  if (rows.targets.length) {
    const values = rows.targets.map((r) => [r.week, r.version, r.screen, r.target, r.taps, r.rage, r.dead, r.slow])
    statements.push(db.prepare(UPSERT_TARGETS).bind(JSON.stringify(values)))
  }
  // batch = transacción: un lote entra entero o no entra.
  try {
    await db.batch(statements)
  } catch (error) {
    await db.batch([
      db.prepare(REFUND_BUDGET).bind(budget.day, total),
      db.prepare(REFUND_IP).bind(budget.day, budget.ip, total),
    ])
    throw error
  }
  return true
}

export function d1Store(db: D1Database): Store {
  return {
    async countDevicesSince(ipHash, since) {
      const row = await db
        .prepare('SELECT COUNT(*) AS n FROM devices WHERE ip_hash = ? AND created_at >= ?')
        .bind(ipHash, since)
        .first<{ n: number }>()
      return row?.n ?? 0
    },

    async createDevice({ id, tokenHash, subscription, ipHash, now }: NewDevice) {
      await db
        .prepare(
          'INSERT INTO devices (id, token_hash, endpoint, p256dh, auth, ip_hash, created_at, seen_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        )
        // Sin suscripción (solo dictado) las columnas quedan vacías: nunca tendrá agenda que enviar.
        .bind(id, tokenHash, subscription?.endpoint ?? '', subscription?.keys.p256dh ?? '', subscription?.keys.auth ?? '', ipHash, now, now)
        .run()
    },

    async findDevice(tokenHash): Promise<Device | null> {
      const row = await db
        .prepare('SELECT id, endpoint, p256dh, auth FROM devices WHERE token_hash = ?')
        .bind(tokenHash)
        .first<DeviceRow>()
      return row ? { id: row.id, subscription: row.endpoint ? subscriptionOf(row) : null } : null
    },

    async touchDevice(id, now, subscription) {
      const statement = subscription
        ? db
            .prepare('UPDATE devices SET seen_at = ?, endpoint = ?, p256dh = ?, auth = ? WHERE id = ?')
            .bind(now, subscription.endpoint, subscription.keys.p256dh, subscription.keys.auth, id)
        : db.prepare('UPDATE devices SET seen_at = ? WHERE id = ?').bind(now, id)
      await statement.run()
    },

    async replaceSchedule(deviceId, items: readonly ScheduleItem[]) {
      const columns = 4
      const inserts = chunk(items, Math.floor(MAX_PARAMS / columns)).map((group) =>
        db
          .prepare(`INSERT INTO schedule (device_id, id, at, payload) VALUES ${group.map(() => '(?, ?, ?, ?)').join(', ')}`)
          .bind(...group.flatMap((item) => [deviceId, item.id, item.at, item.payload])),
      )
      // batch = transacción: nunca queda la agenda a medias.
      await db.batch([db.prepare('DELETE FROM schedule WHERE device_id = ?').bind(deviceId), ...inserts])
    },

    async deleteDevice(id) {
      await db.batch([
        db.prepare('DELETE FROM schedule WHERE device_id = ?').bind(id),
        db.prepare('DELETE FROM devices WHERE id = ?').bind(id),
      ])
    },

    async deleteDevices(ids) {
      if (!ids.length) return
      const statements = chunk(ids, MAX_PARAMS).flatMap((group) => {
        const marks = group.map(() => '?').join(', ')
        return [
          db.prepare(`DELETE FROM schedule WHERE device_id IN (${marks})`).bind(...group),
          db.prepare(`DELETE FROM devices WHERE id IN (${marks})`).bind(...group),
        ]
      })
      await db.batch(statements)
    },

    async dueItems(until, limit): Promise<DueItem[]> {
      const { results } = await db
        .prepare(
          `SELECT s.device_id, s.id AS item_id, s.at, s.payload, s.attempts, d.id, d.endpoint, d.p256dh, d.auth
           FROM schedule s JOIN devices d ON d.id = s.device_id
           WHERE s.at <= ? ORDER BY s.at LIMIT ?`,
        )
        .bind(until, limit)
        .all<DueRow>()
      return results.map((row) => ({
        deviceId: row.device_id,
        id: row.item_id,
        at: row.at,
        payload: row.payload,
        attempts: row.attempts,
        subscription: subscriptionOf(row),
      }))
    },

    async deleteItems(keys) {
      if (keys.length) await db.batch(keyConditions(db, 'DELETE FROM schedule', keys))
    },

    async bumpAttempts(keys, retryAt) {
      if (keys.length) {
        await db.batch(keyConditions(db, 'UPDATE schedule SET attempts = attempts + 1, at = ?', keys, [retryAt]))
      }
    },

    async nextDueAt() {
      const row = await db.prepare('SELECT MIN(at) AS next FROM schedule').first<{ next: number | null }>()
      return row?.next ?? null
    },

    async deleteStaleDevices(seenBefore) {
      await db.batch([
        db.prepare('DELETE FROM schedule WHERE device_id IN (SELECT id FROM devices WHERE seen_at < ?)').bind(seenBefore),
        db.prepare('DELETE FROM devices WHERE seen_at < ?').bind(seenBefore),
      ])
    },

    async countFeedback() {
      const row = await db.prepare('SELECT COUNT(*) AS n FROM feedback').first<{ n: number }>()
      return row?.n ?? 0
    },

    async countFeedbackSince(ipHash, since) {
      const row = await db
        .prepare('SELECT COUNT(*) AS n FROM feedback WHERE ip_hash = ? AND at >= ?')
        .bind(ipHash, since)
        .first<{ n: number }>()
      return row?.n ?? 0
    },

    async addFeedback({ id, at, message, context, shot, ipHash }: NewFeedback) {
      await db
        .prepare('INSERT INTO feedback (id, at, message, context, shot, ip_hash) VALUES (?, ?, ?, ?, ?, ?)')
        .bind(id, at, message, context, shot, ipHash)
        .run()
    },

    async listFeedback(limit): Promise<FeedbackSummary[]> {
      const { results } = await db
        .prepare('SELECT id, at, message, context, shot IS NOT NULL AS has_shot FROM feedback ORDER BY at DESC LIMIT ?')
        .bind(limit)
        .all<FeedbackRow>()
      return results.map((row) => ({ id: row.id, at: row.at, message: row.message, context: row.context, hasShot: Boolean(row.has_shot) }))
    },

    async feedbackShot(id) {
      const row = await db.prepare('SELECT shot FROM feedback WHERE id = ?').bind(id).first<{ shot: string | null }>()
      return row?.shot ?? null
    },

    async deleteFeedback(id) {
      await db.prepare('DELETE FROM feedback WHERE id = ?').bind(id).run()
    },

    async deleteFeedbackBefore(at) {
      await db.prepare('DELETE FROM feedback WHERE at < ?').bind(at).run()
    },

    addStats: (rows, budget) => addStatsRows(db, rows, budget),

    async statsSummary(query): Promise<StatsSummary> {
      const version = query.version
      const [daily, names, previous, cohorts, screens] = await db.batch<Record<string, unknown>>([
        db
          .prepare(
            `SELECT day, platform, version, name, events, devices FROM stats_counts
             WHERE day BETWEEN ?1 AND ?2 AND name LIKE 'u:%'`,
          )
          .bind(query.from, query.to),
        db
          .prepare(
            `SELECT name, SUM(events) AS events, SUM(devices) AS devices FROM stats_counts
             WHERE day BETWEEN ?1 AND ?2 AND ${PREFIXES_NOW} AND ${VERSION_FILTER} GROUP BY name
             ORDER BY devices DESC, events DESC LIMIT ${MAX_NAMES}`,
          )
          .bind(query.from, query.to, version),
        db
          .prepare(
            `SELECT name, SUM(events) AS events, SUM(devices) AS devices FROM stats_counts
             WHERE day BETWEEN ?1 AND ?2 AND ${PREFIXES_BEFORE} AND ${VERSION_FILTER} GROUP BY name
             ORDER BY devices DESC, events DESC LIMIT ${MAX_NAMES}`,
          )
          .bind(query.previousFrom, query.previousTo, version),
        db
          .prepare(
            `SELECT date(day, '-6 days', 'weekday 1') AS week, substr(name, 3) AS cohort, SUM(devices) AS devices
             FROM stats_counts WHERE day BETWEEN ?1 AND ?2 AND name LIKE 'c:%' GROUP BY week, cohort`,
          )
          .bind(query.cohortsFrom, query.to),
        db
          .prepare(
            `SELECT version, screen, SUM(taps) AS taps FROM stats_targets
             WHERE week BETWEEN ?1 AND ?2 GROUP BY version, screen`,
          )
          .bind(query.weeksFrom, query.weeksTo),
      ])
      const rowsOf = (result: D1Result<Record<string, unknown>> | undefined) => result?.results ?? []
      return {
        daily: rowsOf(daily).map((r) => [
          String(r.day),
          String(r.platform),
          String(r.version),
          String(r.name),
          numberOf(r.events),
          numberOf(r.devices),
        ]),
        names: rowsOf(names).map((r) => [String(r.name), numberOf(r.events), numberOf(r.devices)]),
        previous: rowsOf(previous).map((r) => [String(r.name), numberOf(r.events), numberOf(r.devices)]),
        cohorts: rowsOf(cohorts).map((r) => [String(r.week), String(r.cohort), numberOf(r.devices)]),
        screens: rowsOf(screens).map((r) => [String(r.version), String(r.screen), numberOf(r.taps)]),
      }
    },

    async statsHeat(query): Promise<StatsHeat> {
      const filter = `week BETWEEN ?1 AND ?2 AND (?3 IS NULL OR version = ?3) AND screen = ?4`
      const [cells, targets] = await db.batch<Record<string, unknown>>([
        db
          .prepare(
            `SELECT cell, SUM(taps) AS taps, SUM(rage) AS rage, SUM(dead) AS dead FROM stats_cells
             WHERE ${filter} GROUP BY cell`,
          )
          .bind(query.from, query.to, query.version, query.screen),
        db
          .prepare(
            `SELECT target, SUM(taps) AS taps, SUM(rage) AS rage, SUM(dead) AS dead, SUM(slow) AS slow
             FROM stats_targets WHERE ${filter} GROUP BY target ORDER BY taps DESC LIMIT 80`,
          )
          .bind(query.from, query.to, query.version, query.screen),
      ])
      return {
        cells: (cells?.results ?? []).map((r) => [numberOf(r.cell), numberOf(r.taps), numberOf(r.rage), numberOf(r.dead)]),
        targets: (targets?.results ?? []).map((r) => [
          String(r.target),
          numberOf(r.taps),
          numberOf(r.rage),
          numberOf(r.dead),
          numberOf(r.slow),
        ]),
      }
    },

    async deleteStatsBefore(day, today) {
      await db.batch([
        db.prepare('DELETE FROM stats_counts WHERE day < ?').bind(day),
        db.prepare('DELETE FROM stats_cells WHERE week < ?').bind(day),
        db.prepare('DELETE FROM stats_targets WHERE week < ?').bind(day),
        db.prepare('DELETE FROM stats_budget WHERE day < ?').bind(day),
        // Las huellas de IP de los topes no pasan del día.
        db.prepare('DELETE FROM stats_ip WHERE day < ?').bind(today),
      ])
    },
  }
}
