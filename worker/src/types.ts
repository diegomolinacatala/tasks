export interface Subscription {
  endpoint: string
  keys: { p256dh: string; auth: string }
}

export interface ScheduleItem {
  /** Id del recordatorio en el móvil. */
  id: string
  at: number
  /** Contenido cifrado en el móvil (base64url). */
  payload: string
}

export interface Device {
  id: string
  subscription: Subscription
}

export interface DueItem extends ScheduleItem {
  deviceId: string
  attempts: number
  subscription: Subscription
}

export interface ItemKey {
  deviceId: string
  id: string
}

export interface NewDevice {
  id: string
  tokenHash: string
  subscription: Subscription
  ipHash: string
  now: number
}

/** Acceso a datos. La implementación real es D1 (`store.ts`); los tests usan memoria. */
export interface Store {
  countDevicesSince(ipHash: string, since: number): Promise<number>
  createDevice(device: NewDevice): Promise<void>
  findDevice(tokenHash: string): Promise<Device | null>
  touchDevice(id: string, now: number, subscription?: Subscription): Promise<void>
  replaceSchedule(deviceId: string, items: readonly ScheduleItem[]): Promise<void>
  deleteDevice(id: string): Promise<void>
  deleteDevices(ids: readonly string[]): Promise<void>
  dueItems(until: number, limit: number): Promise<DueItem[]>
  deleteItems(keys: readonly ItemKey[]): Promise<void>
  /** Suma un intento y aplaza el aviso a `retryAt`. */
  bumpAttempts(keys: readonly ItemKey[], retryAt: number): Promise<void>
  deleteStaleDevices(seenBefore: number): Promise<void>
  /** Instante del aviso pendiente más próximo de cualquier dispositivo. */
  nextDueAt(): Promise<number | null>
}

/**
 * `gone`: la suscripción ya no existe (borrar dispositivo).
 * `rejected`: el servicio rechaza este mensaje concreto (descartarlo).
 * `retry`: fallo transitorio.
 * `unauthorized`: el servicio rechaza nuestra firma VAPID. Es un fallo de configuración del
 *   servidor, no del dispositivo: nunca se borra nada por esto.
 */
export type PushResult = 'sent' | 'gone' | 'rejected' | 'retry' | 'unauthorized'

export interface Sender {
  send(subscription: Subscription, data: string): Promise<PushResult>
}

export interface Config {
  allowedOrigins: readonly string[]
  vapidPublicKey: string
  /** Sal para anonimizar IPs antes de guardarlas o usarlas como clave de límite. */
  ipSalt: string
}

/** Límite de frecuencia por clave. En producción, el binding nativo de Cloudflare. */
export interface Limiter {
  allow(key: string): Promise<boolean>
}

export interface Limits {
  /** Todas las peticiones, por IP anonimizada. */
  ip: Limiter
  /** Escrituras de un dispositivo autenticado. */
  device: Limiter
  /** Dictado: cada petición cuesta cómputo de IA. */
  voice: Limiter
}

/** Despierta el envío a una hora concreta. En producción, la alarma de un Durable Object. */
export interface Scheduler {
  arm(at: number): Promise<void>
}

/** Voz a texto. En producción, Whisper en Workers AI. */
export interface Transcriber {
  /** `audio`: WAV en base64 estándar. */
  transcribe(audio: string): Promise<string>
}

/** Fecha y hora locales del móvil: el servidor no conoce la zona horaria del usuario. */
export interface InterpretContext {
  today: string
  now: string
}

export type InterpretedReminder = { kind: 'before'; minutes: number } | { kind: 'at'; date: string; time: string }

export interface InterpretedTask {
  title: string
  date: string | null
  time: string | null
  reminders: InterpretedReminder[]
  /** "al pasar por Mercadona": el nombre tal como se dijo. El móvil lo empareja con sus lugares. */
  place?: { name: string; on: 'arrive' | 'leave' }
}

/** Texto dictado → tareas estructuradas. En producción, un LLM de Workers AI. */
export interface Interpreter {
  interpret(text: string, context: InterpretContext): Promise<InterpretedTask[]>
}

export interface Deps {
  store: Store
  sender: Sender
  config: Config
  limits: Limits
  scheduler: Scheduler
  transcriber: Transcriber
  interpreter: Interpreter
  now: () => number
}
