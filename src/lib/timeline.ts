import type { Routine, Task } from '../types'
import type { CalendarEvent, TimedEvent } from './calendar'
import { clockLabel } from './date'
import { durationLabel, minutesOf } from './duration'
import { language } from './i18n'
import { compareText } from './order'

/**
 * El horario de un día, como en Structured: lo que tiene hora, en orden a lo largo de una línea,
 * con el tiempo libre entre medias y una marca de "ahora". Lo que está en curso no lleva marca: su
 * propio trazo se va rellenando. Lo que coincide en el tiempo va en paralelo, en carriles uno al lado
 * del otro (`TimelineCluster`). Todo en minutos desde medianoche.
 */

interface Placed {
  id: string
  start: number
  end: number
  /** Solo hoy: de 0 a 1, lo que lleva hecho algo que está en curso ahora mismo. */
  live?: number
}

export type TimelineItem =
  | (Placed & { kind: 'task'; task: Task })
  | (Placed & { kind: 'routine'; routine: Routine })
  | (Placed & { kind: 'event'; event: CalendarEvent })

/**
 * Lo que coincide en el tiempo, en paralelo: cada carril es una columna con lo suyo en orden. Va de lo
 * primero que empieza a lo último que acaba.
 */
export interface TimelineCluster {
  kind: 'cluster'
  id: string
  start: number
  end: number
  lanes: TimelineItem[][]
}

/** Tiempo libre: de `start` a `end` (`minutes`, lo que dura). */
export interface TimelineGap {
  kind: 'gap'
  id: string
  start: number
  end: number
  minutes: number
}

export type TimelineRow = TimelineItem | TimelineCluster | TimelineGap | { kind: 'now'; id: 'now'; minutes: number }

/** Hueco a partir del cual se dice cuánto tiempo libre queda entre dos cosas. */
export const MIN_GAP = 45
/** A partir de aquí ("11 h 30 libres" entre el desayuno y la lectura de la noche) ya no dice nada. */
export const MAX_GAP = 6 * 60
/** Carriles a la vez como mucho: en un móvil no caben más. Lo que no quepa va debajo en el que antes se libere. */
export const MAX_LANES = 2

/** Hasta dónde ocupa algo para coincidir con otra cosa: lo que dura; sin duración, su minuto (dos cosas a la misma hora coinciden). */
const occupies = (item: TimelineItem): number => (item.end > item.start ? item.end : item.start + 1)

/**
 * Lo que tiene hora ese día: tareas (con su duración), rutinas y los eventos del calendario del iPhone,
 * que cuentan para el tiempo libre como cualquier otra cosa.
 */
export function timelineItems(tasks: readonly Task[], routines: readonly Routine[], events: readonly TimedEvent[] = []): TimelineItem[] {
  const fromTasks = tasks.flatMap((task): TimelineItem[] => {
    if (!task.time) return []
    const start = minutesOf(task.time)
    return [{ kind: 'task', id: task.id, start, end: start + (task.duration ?? 0), task }]
  })
  const fromRoutines = routines.flatMap((routine): TimelineItem[] => {
    if (!routine.time) return []
    const start = minutesOf(routine.time)
    return [{ kind: 'routine', id: `routine:${routine.id}`, start, end: start, routine }]
  })
  const fromEvents = events.map(({ event, start, end }): TimelineItem => ({ kind: 'event', id: `event:${event.key}`, start, end, event }))
  return [...fromEvents, ...fromTasks, ...fromRoutines].sort((a, b) => a.start - b.start || a.end - b.end || compareText(a.id, b.id))
}

/**
 * Lo que coincide, junto: cada grupo de cosas que se solapan (aunque sea en cadena) es un
 * `TimelineCluster` con sus carriles; lo que va solo sigue siendo una fila. `items` en orden.
 */
export function groupParallel(items: readonly TimelineItem[]): (TimelineItem | TimelineCluster)[] {
  const units: (TimelineItem | TimelineCluster)[] = []
  let group: TimelineItem[] = []
  let reach = -Infinity
  for (const item of items) {
    if (group.length && item.start >= reach) {
      units.push(group.length === 1 ? group[0]! : clusterOf(group))
      group = []
    }
    reach = group.length ? Math.max(reach, occupies(item)) : occupies(item)
    group = [...group, item]
  }
  if (group.length) units.push(group.length === 1 ? group[0]! : clusterOf(group))
  return units
}

/** Cada cosa al primer carril libre a su hora; sin ninguno (y sin sitio para otro), al que antes se libere. */
function clusterOf(group: readonly TimelineItem[]): TimelineCluster {
  let lanes: TimelineItem[][] = []
  let ends: number[] = []
  for (const item of group) {
    let lane = ends.findIndex((end) => end <= item.start)
    if (lane === -1) lane = lanes.length < MAX_LANES ? lanes.length : ends.indexOf(Math.min(...ends))
    lanes = lane === lanes.length ? [...lanes, [item]] : lanes.map((list, index) => (index === lane ? [...list, item] : list))
    ends = lane === ends.length ? [...ends, occupies(item)] : ends.map((end, index) => (index === lane ? Math.max(end, occupies(item)) : end))
  }
  const first = group[0]!
  return { kind: 'cluster', id: `cluster:${first.id}`, start: first.start, end: Math.max(...group.map((item) => item.end)), lanes }
}

/**
 * Las filas del horario. `now` (minutos) solo se pasa si el día es hoy: marca lo que está en curso
 * o, si no hay nada, dónde cae el momento actual. Lo que coincide va en paralelo (`groupParallel`).
 */
export function buildTimeline(items: readonly TimelineItem[], now: number | null, minGap = MIN_GAP, maxGap = MAX_GAP): TimelineRow[] {
  const placed = items.map((item) =>
    now !== null && item.end > item.start && item.start <= now && now < item.end
      ? { ...item, live: (now - item.start) / (item.end - item.start) }
      : item,
  )
  const hasLive = placed.some((item) => item.live !== undefined)
  const rows: TimelineRow[] = []
  let reach: number | null = null
  let nowPlaced = now === null || hasLive || !placed.length

  for (const unit of groupParallel(placed)) {
    const nowHere = !nowPlaced && now !== null && now < unit.start
    if (nowHere) {
      rows.push({ kind: 'now', id: 'now', minutes: now })
      nowPlaced = true
    }
    // El tiempo libre que ya pasó no cuenta: si ahora cae en el hueco, se mide desde ahora.
    const from = nowHere && now !== null ? Math.max(now, reach ?? now) : reach
    const gap = from !== null ? unit.start - from : 0
    if (from !== null && gap >= minGap && gap < maxGap) rows.push({ kind: 'gap', id: `gap:${unit.id}`, start: from, end: unit.start, minutes: gap })
    rows.push(unit)
    reach = Math.max(reach ?? unit.end, unit.end)
  }
  if (!nowPlaced && now !== null) rows.push({ kind: 'now', id: 'now', minutes: now })
  return rows
}

/** `45 min libres`, `1 h libre`, `1 h 30 min libres` · `1 hr 30 min free`. */
export function freeLabel(minutes: number): string {
  const label = durationLabel(minutes)
  if (language() === 'en') return `${label} free`
  return `${label} ${label === '1 h' ? 'libre' : 'libres'}`
}

/** `9:05` (`9:05 AM`): sin cero delante, como el resto de horas. */
export const clockOf = (minutes: number): string => clockLabel(minutes)
