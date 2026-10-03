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

-- Sugerencias que se mandan desde Ajustes. Las lee el desarrollador en /buzon; archivar las borra.
-- `shot`: la captura con lo rodeado (JPEG en base64), si quien la manda la deja.
CREATE TABLE IF NOT EXISTS feedback (
  id TEXT PRIMARY KEY,
  at INTEGER NOT NULL,
  message TEXT NOT NULL,
  context TEXT NOT NULL,
  shot TEXT,
  ip_hash TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS feedback_ip ON feedback (ip_hash, at);
CREATE INDEX IF NOT EXISTS feedback_at ON feedback (at);
