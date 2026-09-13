// Aplica schema.sql con `d1 execute --command` en vez de `--file`.
// `--file` sube el SQL a una URL de importación que algunos firewalls/antivirus bloquean
// ("fetch failed"); `--command` usa la API normal de consultas.
// Uso: node scripts/apply-schema.mjs [--local]
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

const sql = readFileSync(new URL('../schema.sql', import.meta.url), 'utf8')
  .split('\n')
  .filter((line) => !line.trim().startsWith('--'))
  .join(' ')
  .replace(/\s+/g, ' ')
  .trim()

const target = process.argv.includes('--local') ? '--local' : '--remote'
const windows = process.platform === 'win32'
// En Windows npx es un .cmd y necesita shell: el SQL va entre comillas (no contiene ninguna).
const args = ['wrangler', 'd1', 'execute', 'tasks-push', target, '--yes', '--command', windows ? `"${sql}"` : sql]

const result = spawnSync('npx', args, { stdio: 'inherit', shell: windows })
process.exit(result.status ?? 1)
