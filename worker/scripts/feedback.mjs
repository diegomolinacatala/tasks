// Descarga el buzón de sugerencias a ../feedback/ (fuera de git): una ficha .md por sugerencia, con su
// captura al lado. Para leerlas en el portátil o pasárselas a Claude.
// Uso: npm run feedback            (la clave sale de worker/.feedback-key o de FEEDBACK_KEY)
//      npm run feedback -- --archive   además las borra del buzón tras guardarlas
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'

const API = (process.env.TASKS_API ?? 'https://tasks-push.diegomolina.workers.dev').replace(/\/+$/, '')
const keyFile = new URL('../.feedback-key', import.meta.url)
const key = process.env.FEEDBACK_KEY ?? (existsSync(keyFile) ? readFileSync(keyFile, 'utf8').trim() : '')
if (!key) {
  console.error('Falta la clave del buzón: worker/.feedback-key o la variable FEEDBACK_KEY.')
  process.exit(1)
}

const call = async (path, init = {}) => {
  const response = await fetch(`${API}${path}`, { ...init, headers: { authorization: `Bearer ${key}` } })
  if (!response.ok) throw new Error(`${init.method ?? 'GET'} ${path}: ${response.status}`)
  return response
}

const out = new URL('../../feedback/', import.meta.url)
mkdirSync(out, { recursive: true })

const { data: items } = await (await call('/v1/feedback')).json()
for (const item of items) {
  const context = JSON.parse(item.context)
  const name = `${new Date(item.at).toISOString().slice(0, 16).replace(/[:T]/g, '-')}-${item.id.slice(0, 8)}`
  const lines = [
    `# Sugerencia del ${new Date(item.at).toLocaleString('es-ES')}`,
    '',
    item.message,
    '',
    `- Pantalla: ${context.screen}${context.sheet ? ` · panel «${context.sheet}»` : ''}`,
    `- App: ${context.app.platform} ${context.app.version}, ${context.app.language}, tema ${context.app.theme}`,
    `- Dispositivo: ${context.device}`,
  ]
  if (context.region) {
    const { x, y, width, height } = context.region
    lines.push(`- Zona rodeada: x ${x}, y ${y}, ${width} × ${height} (pantalla de ${context.viewport.width} × ${context.viewport.height})`)
  }
  if (context.elements.length) lines.push('', '## Lo rodeado', '', ...context.elements.map((line) => `- ${line}`))
  if (item.hasShot) {
    const image = Buffer.from(await (await call(`/v1/feedback/${item.id}/shot`)).arrayBuffer())
    writeFileSync(new URL(`${name}.jpg`, out), image)
    lines.push('', `![Captura](${name}.jpg)`)
  }
  writeFileSync(new URL(`${name}.md`, out), `${lines.join('\n')}\n`)
  if (process.argv.includes('--archive')) await call(`/v1/feedback/${item.id}`, { method: 'DELETE' })
  console.log(`${name}: ${item.message.slice(0, 70).replace(/\s+/g, ' ')}`)
}
console.log(items.length ? `${items.length} en feedback/` : 'El buzón está vacío.')
