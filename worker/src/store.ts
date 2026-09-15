import type { Device, DueItem, ItemKey, NewDevice, ScheduleItem, Store, Subscription } from './types'

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
  }
}
