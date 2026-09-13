-- Un dispositivo = una suscripción push. Sin cuentas: el token se guarda solo como hash.
CREATE TABLE IF NOT EXISTS devices (
  id TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL UNIQUE,
  endpoint TEXT NOT NULL,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  ip_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  seen_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS devices_ip ON devices (ip_hash, created_at);
CREATE INDEX IF NOT EXISTS devices_seen ON devices (seen_at);

-- Avisos pendientes. `payload` va cifrado en el móvil: el servidor no puede leerlo.
CREATE TABLE IF NOT EXISTS schedule (
  device_id TEXT NOT NULL REFERENCES devices (id) ON DELETE CASCADE,
  id TEXT NOT NULL,
  at INTEGER NOT NULL,
  payload TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (device_id, id)
);

CREATE INDEX IF NOT EXISTS schedule_at ON schedule (at);
