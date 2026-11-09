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
  /** `null`: la app nativa, que solo usa el dictado (sus avisos son locales). */
  subscription: Subscription | null
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
  subscription: Subscription | null
  ipHash: string
  now: number
}

export interface NewFeedback {
  id: string
  at: number
  message: string
  /** JSON ya saneado (`parseFeedback`). */
  context: string
  shot: string | null
  ipHash: string
}

/** Una sugerencia tal como la ve el buzón; la captura se pide aparte. */
export interface FeedbackSummary {
  id: string
  at: number
  message: string
  context: string
  hasShot: boolean
}

/**
 * Un contador del día. `platform` y `version` van vacíos en lo que describe al dispositivo (idioma,
 * tema, cohorte…), para no cruzar dimensiones. `devices`: cuántos dispositivos lo hicieron ese día.
 */
export interface CountRow {
  day: string
  platform: string
  version: string
  /** `u:` ping de uso, `e:` evento, `d:` distribución (`d:métrica:tramo`), `x:` error, `c:` cohorte. */
  name: string
  events: number
  devices: number
}

/** Toques de una celda de la rejilla de una pantalla, por semana (el lunes) y versión. */
export interface CellRow {
  week: string
  version: string
  screen: string
  cell: number
  taps: number
  rage: number
  dead: number
}

/** Toques de un elemento (por su clase CSS) de una pantalla, por semana y versión. */
export interface TargetRow {
  week: string
  version: string
  screen: string
  target: string
  taps: number
  rage: number
  dead: number
  slow: number
}

export interface StatsRows {
  counts: CountRow[]
  cells: CellRow[]
  targets: TargetRow[]
}

export interface StatsSummaryQuery {
  from: string
  to: string
  previousFrom: string
  previousTo: string
  cohortsFrom: string
  weeksFrom: string
  weeksTo: string
  /** Solo esa versión (más lo que no va por versión); `null`, todas. */
  version: string | null
}

/** Lo que pinta el panel, ya sumado en D1: el Worker nunca recorre filas sueltas. */
export interface StatsSummary {
  /** `[día, plataforma, versión, nombre, eventos, dispositivos]` de los pings (`u:`). */
  daily: [string, string, string, string, number, number][]
  /** `[nombre, eventos, dispositivos]` de eventos, distribuciones y errores en el periodo. */
  names: [string, number, number][]
  /** Lo mismo del periodo anterior (solo eventos y errores), para comparar. */
  previous: [string, number, number][]
  /** `[semana, cohorte, dispositivos]`: quién de cada cohorte vuelve cada semana. */
  cohorts: [string, string, number][]
  /** `[versión, pantalla, toques]`: qué mapas de calor hay. */
  screens: [string, string, number][]
}

export interface StatsHeatQuery {
  from: string
  to: string
  version: string | null
  screen: string
}

export interface StatsHeat {
  /** `[celda, toques, rabia, muertos]`. */
  cells: [number, number, number, number][]
  /** `[objetivo, toques, rabia, muertos, lentos]`, los más tocados primero. */
  targets: [string, number, number, number, number][]
}

/** Lo que se puede escribir hoy: en total y desde una misma IP (anonimizada, guardada solo ese día). */
export interface StatsBudget {
  day: string
  max: number
  ip: string
  ipMax: number
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
  countFeedback(): Promise<number>
  countFeedbackSince(ipHash: string, since: number): Promise<number>
  addFeedback(feedback: NewFeedback): Promise<void>
  /** Las más recientes primero. */
  listFeedback(limit: number): Promise<FeedbackSummary[]>
  feedbackShot(id: string): Promise<string | null>
  deleteFeedback(id: string): Promise<void>
  deleteFeedbackBefore(at: number): Promise<void>
  /**
   * Suma los contadores si caben en el presupuesto de escrituras del día; si no, no escribe nada y
   * devuelve `false`.
   */
  addStats(rows: StatsRows, budget: StatsBudget): Promise<boolean>
  statsSummary(query: StatsSummaryQuery): Promise<StatsSummary>
  statsHeat(query: StatsHeatQuery): Promise<StatsHeat>
  /** Borra lo de antes de `day` (y lo de las semanas que empiezan antes), y los topes por IP de antes de `today`. */
  deleteStatsBefore(day: string, today: string): Promise<void>
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
  /** Clave del buzón de sugerencias (secret `FEEDBACK_KEY`). Sin ella, el buzón no se abre. */
  feedbackKey: string | null
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
  /** Lotes de estadísticas, por IP anonimizada: cada uno son escrituras de D1. */
  stats: Limiter
}

/** Despierta el envío a una hora concreta. En producción, la alarma de un Durable Object. */
export interface Scheduler {
  arm(at: number): Promise<void>
}

/** Voz a texto. En producción, Whisper en Workers AI. */
/** Idioma de lo dictado: el de la app que lo manda. Las versiones anteriores al inglés no lo dicen: español. */
export type SpeechLanguage = 'es' | 'en'

export interface Transcriber {
  /** `audio`: WAV en base64 estándar. */
  transcribe(audio: string, language: SpeechLanguage): Promise<string>
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
  /** Minutos que dura ("durante una hora", "de 5 a 7"). El móvil pregunta al acabar. */
  duration?: number
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
