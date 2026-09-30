import type { Routine, Task } from '../types'
import { durationLabel, minutesOf } from './duration'

/**
 * El horario de un día, como en Structured: lo que tiene hora, en orden a lo largo de una línea,
 * con el tiempo libre entre medias y una marca de "ahora". Lo que está en curso no lleva marca: su
 * propio trazo se va rellenando. Todo en minutos desde medianoche.
 */

interface Placed {
  id: string
  start: number
  end: number
  /** Solo hoy: de 0 a 1, lo que lleva hecho algo que está en curso ahora mismo. */
  live?: number
}

export type TimelineItem = (Placed & { kind: 'task'; task: Task }) | (Placed & { kind: 'routine'; routine: Routine })

export type TimelineRow = TimelineItem | { kind: 'gap'; id: string; minutes: number } | { kind: 'now'; id: 'now'; minutes: number }

/** Hueco a partir del cual se dice cuánto tiempo libre queda entre dos cosas. */
export const MIN_GAP = 45

/** Lo que tiene hora ese día: tareas (con su duración) y rutinas. */
export function timelineItems(tasks: readonly Task[], routines: readonly Routine[]): TimelineItem[] {
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
  return [...fromTasks, ...fromRoutines].sort((a, b) => a.start - b.start || a.end - b.end || a.id.localeCompare(b.id))
}

/**
 * Las filas del horario. `now` (minutos) solo se pasa si el día es hoy: marca lo que está en curso
 * o, si no hay nada, dónde cae el momento actual.
 */
export function buildTimeline(items: readonly TimelineItem[], now: number | null, minGap = MIN_GAP): TimelineRow[] {
  const placed = items.map((item) =>
    now !== null && item.end > item.start && item.start <= now && now < item.end
      ? { ...item, live: (now - item.start) / (item.end - item.start) }
      : item,
  )
  const hasLive = placed.some((item) => item.live !== undefined)
  const rows: TimelineRow[] = []
  let reach: number | null = null
  let nowPlaced = now === null || hasLive || !placed.length

  for (const item of placed) {
    const nowHere = !nowPlaced && now !== null && now < item.start
    if (nowHere) {
      rows.push({ kind: 'now', id: 'now', minutes: now })
      nowPlaced = true
    }
    // El tiempo libre que ya pasó no cuenta: si ahora cae en el hueco, se mide desde ahora.
    const from = nowHere && now !== null ? Math.max(now, reach ?? now) : reach
    if (from !== null && item.start - from >= minGap) rows.push({ kind: 'gap', id: `gap:${item.id}`, minutes: item.start - from })
    rows.push(item)
    reach = Math.max(reach ?? item.end, item.end)
  }
  if (!nowPlaced && now !== null) rows.push({ kind: 'now', id: 'now', minutes: now })
  return rows
}

/** `45 min libres`, `1 h libre`, `1 h 30 libres`. */
export function freeLabel(minutes: number): string {
  const label = durationLabel(minutes)
  return `${label} ${label === '1 h' ? 'libre' : 'libres'}`
}

/** `9:05`: sin cero delante, como el resto de horas. */
export function clockOf(minutes: number): string {
  const hours = Math.floor(minutes / 60) % 24
  return `${hours}:${String(minutes % 60).padStart(2, '0')}`
}
