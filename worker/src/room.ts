import { DurableObject } from 'cloudflare:workers'
import type { Env } from './env'
import { RoomCore } from './roomCore'
import { ROOM_ROUTE, handleRoomHttp, type RoomOutcome } from './roomHttp'
import { CLOSE, handleSocketMessage, type SocketAttachment, type SocketPort } from './roomSocket'
import { sqlRoomStore } from './roomSql'

const attachmentOf = (ws: WebSocket): SocketAttachment => {
  const value: unknown = ws.deserializeAttachment()
  const member = (value as { member?: unknown } | null)?.member
  return { member: typeof member === 'string' ? member : null }
}

/** Un socket que ya se cerró no debe tumbar lo que se manda a los demás. */
function trySend(ws: WebSocket, message: string): void {
  try {
    ws.send(message)
  } catch {
    // Se fue: su cierre llega por `webSocketClose`.
  }
}

function tryClose(ws: WebSocket, code: number, reason: string): void {
  try {
    ws.close(code, reason)
  } catch {
    // Ya estaba cerrado.
  }
}

/**
 * Una sala (el grupo de tus dispositivos o una cesta compartida): SQLite propio y sockets con hibernación,
 * que no cuestan mientras nadie escribe. La lógica vive en `RoomCore`; esto solo la conecta.
 */
export class Room extends DurableObject<Env> {
  private core: RoomCore | null = null

  /** Se crea al usarse: tras borrar la sala entera (`deleteAll`) hay que volver a crear las tablas. */
  private get room(): RoomCore {
    this.core ??= new RoomCore(sqlRoomStore(this.ctx.storage.sql))
    return this.core
  }

  async fetch(request: Request): Promise<Response> {
    if (request.headers.get('upgrade')?.toLowerCase() === 'websocket') return this.accept(request)
    const outcome = await handleRoomHttp(this.room, request, Date.now())
    await this.apply(outcome)
    return outcome.response
  }

  private accept(request: Request): Response {
    const match = ROOM_ROUTE.exec(new URL(request.url).pathname)
    if (match?.[2] !== 'socket' || match[3]) return new Response(null, { status: 404 })
    const [client, server] = Object.values(new WebSocketPair()) as [WebSocket, WebSocket]
    this.ctx.acceptWebSocket(server)
    server.serializeAttachment({ member: null } satisfies SocketAttachment)
    return new Response(null, { status: 101, webSocket: client })
  }

  private sockets(filter: (attachment: SocketAttachment) => boolean, except?: WebSocket): WebSocket[] {
    return this.ctx.getWebSockets().filter((ws) => ws !== except && filter(attachmentOf(ws)))
  }

  private async apply(outcome: RoomOutcome): Promise<void> {
    if (outcome.broadcast) {
      for (const ws of this.sockets((a) => a.member !== null)) trySend(ws, outcome.broadcast)
    }
    if (outcome.kicked) {
      for (const ws of this.sockets((a) => a.member === outcome.kicked)) tryClose(ws, CLOSE.removed, 'ya no eres miembro')
    }
    if (outcome.destroyed) {
      await this.wipe()
      return
    }
    if (outcome.alarm !== undefined) await this.ctx.storage.setAlarm(outcome.alarm)
  }

  private async wipe(): Promise<void> {
    for (const ws of this.ctx.getWebSockets()) tryClose(ws, CLOSE.missing, 'la sala no existe')
    await this.ctx.storage.deleteAlarm()
    await this.ctx.storage.deleteAll()
    this.core = null
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    const port: SocketPort = {
      send: (text) => trySend(ws, text),
      broadcast: (text) => {
        for (const other of this.sockets((a) => a.member !== null, ws)) trySend(other, text)
      },
      close: (code, reason) => tryClose(ws, code, reason),
      attach: (attachment) => ws.serializeAttachment(attachment),
    }
    const alarm = await handleSocketMessage(this.room, attachmentOf(ws), message, port, Date.now())
    if (alarm !== null) await this.ctx.storage.setAlarm(alarm)
  }

  async webSocketClose(ws: WebSocket): Promise<void> {
    // Devuelve el cierre (según la fecha de compatibilidad, workerd no lo hace solo).
    tryClose(ws, 1000, '')
  }

  /** Un año sin que nadie la abra: se borra entera. Si hubo actividad, se reprograma. */
  async alarm(): Promise<void> {
    if (this.room.expired(Date.now())) {
      await this.wipe()
      return
    }
    const at = this.room.alarmAt()
    if (at !== null) await this.ctx.storage.setAlarm(at)
  }
}
