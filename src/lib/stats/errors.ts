/**
 * La firma de un error: su clase y dónde saltó en nuestro código (`TypeError@index-3f2a.js:1:2345`).
 * Nunca el mensaje: en JavaScriptCore, el de `JSON.parse` cita el texto, que puede ser de quien usa la app.
 */

const NAME = /^[A-Za-z][A-Za-z0-9_]{0,39}$/
/** El primer fichero de la app en la pila: `/assets/index-3f2a.js:1:2345`. */
const FRAME = /\/assets\/([A-Za-z0-9._-]{1,60}\.js):(\d{1,7}):(\d{1,7})/

export function errorSignature(error: unknown): string {
  const raw = error instanceof Error ? error.name : typeof error === 'object' && error !== null ? 'Object' : typeof error
  const name = NAME.test(raw) ? raw : 'Error'
  const stack = error instanceof Error && typeof error.stack === 'string' ? error.stack : ''
  const frame = FRAME.exec(stack)
  return frame ? `${name}@${frame[1]}:${frame[2]}:${frame[3]}` : name
}
