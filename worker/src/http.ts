/** Piezas HTTP que comparten el Worker y los Durable Objects de las salas y los emparejamientos. */

export const MAX_BODY_BYTES = 512_000

export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message)
  }
}

export const tooLarge = () => new HttpError(413, 'cuerpo demasiado grande')
export const tooMany = () => new HttpError(429, 'demasiadas peticiones, prueba más tarde')

export const json = (status: number, body: unknown, headers: Headers = new Headers()) => {
  headers.set('content-type', 'application/json')
  return new Response(JSON.stringify(body), { status, headers })
}

export const empty = (headers: Headers = new Headers()) => new Response(null, { status: 204, headers })

/** Lee el cuerpo cortando en cuanto supera el máximo: `content-length` puede faltar o mentir. */
export async function readBody(request: Request, maxBytes: number): Promise<string> {
  if (Number(request.headers.get('content-length') ?? '0') > maxBytes) throw tooLarge()
  if (!request.body) return ''
  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.byteLength
    if (size > maxBytes) {
      await reader.cancel()
      throw tooLarge()
    }
    chunks.push(value)
  }
  const bytes = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  return new TextDecoder().decode(bytes)
}

export function parseJsonObject(text: string): Record<string, unknown> {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    throw new HttpError(400, 'JSON inválido')
  }
  return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {}
}

export async function readJson(request: Request, maxBytes = MAX_BODY_BYTES): Promise<Record<string, unknown>> {
  return parseJsonObject(await readBody(request, maxBytes))
}

export function unwrap<T>(result: { ok: true; value: T } | { ok: false; error: string }): T {
  if (!result.ok) throw new HttpError(400, result.error)
  return result.value
}

/** Respuesta de error con el sobre de siempre. */
export const errorResponse = (error: HttpError, headers?: Headers) => json(error.status, { error: error.message }, headers)
