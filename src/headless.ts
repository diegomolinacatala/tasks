/**
 * Entrada del paquete `headless.js` que la app de iPhone ejecuta con JavaScriptCore, fuera del
 * WebView (`ios/App/App/HeadlessCore.swift`). Allí no hay navegador: ni `window`, ni `fetch`, ni
 * `console`. Todo entra y sale como JSON en texto. `scripts/check-headless.mjs` lo comprueba.
 */
import { addFromText, answerAsk, moveOverdue, sharesDictation, voiceContext } from './lib/headless'
import { createId } from './lib/id'

/** Contrato con el lado nativo: sube si cambia la forma de lo que entra o sale. */
export const version = 4

/** Servidor del dictado de esta compilación; vacío si no lo tiene. */
export const api = import.meta.env.VITE_PUSH_API ?? ''

/** Fichero de estado → `"true"` si se dio permiso para mandar lo dictado al servidor. */
export const consent = (state: string): string => String(sharesDictation(JSON.parse(state)))

/** `{ today, now }` para la IA del servidor. */
export const context = (now: number): string => JSON.stringify(voiceContext(now))

/** `HeadlessInput` → `HeadlessResult`. */
export const add = (input: string): string => JSON.stringify(addFromText(JSON.parse(input), createId))

/** `MoveInput` → `HeadlessResult`: pasar lo atrasado a hoy. */
export const move = (input: string): string => JSON.stringify(moveOverdue(JSON.parse(input), createId))

/** `AskInput` → `HeadlessResult`: "Sí, hecha" o "Todavía no" desde el aviso de cierre. */
export const answer = (input: string): string => JSON.stringify(answerAsk(JSON.parse(input), createId))
