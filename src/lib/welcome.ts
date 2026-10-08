/**
 * Qué bienvenida toca al abrir la app. La primera vez, entera; tras una actualización, solo las
 * láminas que enseñan algo que este dispositivo aún no ha visto. El dispositivo guarda la última
 * versión de la bienvenida que cerró (`Settings.welcome`; 0 = ninguna, también las copias de antes).
 */

export type PlateId = 'write' | 'details' | 'swipe' | 'month' | 'routine' | 'suggest' | 'calendar'

/**
 * Versión de la bienvenida en que entró cada lámina. Una lámina nueva, o una que cambie para enseñar
 * algo nuevo, lleva la siguiente a la mayor de aquí: quien ya la vio la verá al actualizar, solo con eso.
 * 1: la 1.2. 2: la 1.3 (la ficha del compositor). 3: la 1.4 (las sugerencias). 4: la 1.6 (el calendario
 * del iPhone en la Agenda; solo en el iPhone, ver `platesAfter`).
 */
export const PLATE_SINCE: Readonly<Record<PlateId, number>> = {
  write: 1,
  details: 2,
  swipe: 1,
  month: 1,
  routine: 1,
  suggest: 3,
  calendar: 4,
}

export const WELCOME_VERSION = Math.max(...Object.values(PLATE_SINCE))

/** Las láminas que existen en esta plataforma: el calendario solo donde lo hay (el iPhone). */
export function availablePlates(calendar: boolean): PlateId[] {
  return (Object.keys(PLATE_SINCE) as PlateId[]).filter((id) => calendar || id !== 'calendar')
}

export interface WelcomeRun {
  /** Se enseñan las láminas que entraron después de esta versión: con 0, todas. */
  after: number
  /** Ya conocía la app: la portada anuncia lo nuevo en lugar de presentarla. */
  news: boolean
}

/** La entera, presentando la app: la primera vez y desde Ajustes. */
export const FULL_WELCOME: WelcomeRun = { after: 0, news: false }

/**
 * Al abrir: entera si no había nada guardado, lo nuevo si hay láminas sin ver, y si no, nada. `plates`:
 * las de esta plataforma; una lámina que aquí no existe (el calendario en la PWA) no cuenta como nueva.
 */
export function welcomeOnLaunch(fresh: boolean, seen: number, plates: readonly PlateId[] = Object.keys(PLATE_SINCE) as PlateId[]): WelcomeRun | null {
  if (fresh) return FULL_WELCOME
  return plates.some((id) => PLATE_SINCE[id] > seen) ? { after: seen, news: true } : null
}

/** Las láminas posteriores a `after`, en el orden en que se dan. */
export function platesAfter<T extends { id: PlateId }>(plates: readonly T[], after: number): T[] {
  return plates.filter((plate) => PLATE_SINCE[plate.id] > after)
}

/** Lo que no sea un entero positivo (copias anteriores, datos rotos) cuenta como no vista. */
export function normalizeWelcome(raw: unknown): number {
  return typeof raw === 'number' && Number.isInteger(raw) && raw > 0 ? raw : 0
}
