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

-- Estadísticas de uso anónimas: solo contadores, nunca un lote ni nada que diga qué dispositivo mandó qué.
-- `day` es el día local del móvil. `name`: `u:` ping de uso, `e:` evento, `d:` distribución, `x:` error,
-- `c:` cohorte. Lo que describe al dispositivo va con `platform` y `version` vacíos. Sin ROWID: la clave
-- primaria es la propia tabla y cada fila cuesta una sola escritura.
CREATE TABLE IF NOT EXISTS stats_counts (
  day TEXT NOT NULL,
  platform TEXT NOT NULL,
  version TEXT NOT NULL,
  name TEXT NOT NULL,
  events INTEGER NOT NULL DEFAULT 0,
  devices INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, platform, version, name)
) WITHOUT ROWID;

-- Mapa de calor: toques por celda de una rejilla de 16 × 32 sobre la pantalla, por semana (su lunes).
CREATE TABLE IF NOT EXISTS stats_cells (
  week TEXT NOT NULL,
  version TEXT NOT NULL,
  screen TEXT NOT NULL,
  cell INTEGER NOT NULL,
  taps INTEGER NOT NULL DEFAULT 0,
  rage INTEGER NOT NULL DEFAULT 0,
  dead INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (week, version, screen, cell)
) WITHOUT ROWID;

-- Lo mismo por elemento tocado (su clase CSS, nunca su texto).
CREATE TABLE IF NOT EXISTS stats_targets (
  week TEXT NOT NULL,
  version TEXT NOT NULL,
  screen TEXT NOT NULL,
  target TEXT NOT NULL,
  taps INTEGER NOT NULL DEFAULT 0,
  rage INTEGER NOT NULL DEFAULT 0,
  dead INTEGER NOT NULL DEFAULT 0,
  slow INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (week, version, screen, target)
) WITHOUT ROWID;

-- Escrituras de estadísticas por día UTC: con el tope lleno, los lotes se descartan y los avisos siguen.
CREATE TABLE IF NOT EXISTS stats_budget (
  day TEXT PRIMARY KEY,
  rows INTEGER NOT NULL
) WITHOUT ROWID;

-- Lo escrito hoy desde cada IP (su huella anonimizada), para que nadie solo agote el presupuesto. Se
-- borra al día siguiente.
CREATE TABLE IF NOT EXISTS stats_ip (
  day TEXT NOT NULL,
  ip TEXT NOT NULL,
  rows INTEGER NOT NULL,
  PRIMARY KEY (day, ip)
) WITHOUT ROWID;
