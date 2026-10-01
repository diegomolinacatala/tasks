import type { IsoDate, IsoTime, Place, Reminder, ReminderDraft, Section, Task, TaskDraft } from '../types'
import { isValidTime, relativeLabel } from './date'
import { normalizeDuration, spanLabel } from './duration'
import { DEFAULT_IMPORTANCE, clampImportance } from './importance'
import { MAX_REMINDERS, reminderLabel, sameReminder } from './reminders'
import type { RoutineDraft } from './repeat'
import { routineLabel } from './repeat'
import { cleanDays } from './routines'

/**
 * La ficha del compositor: todo lo que se puede decidir antes de añadir, lo mismo que en el panel de
 * una tarea, más si se repite (entonces es una rutina). Al desplegarla, lo que la frase ya decía pasa
 * a sus campos, así que lo que se ve es exactamente lo que se va a crear. Los avisos llevan un id
 * propio para poder quitarlos uno a uno; se lo quita `toTaskDraft`.
 */
export interface Details {
  date: IsoDate | null
  time: IsoTime | null
  duration: number | null
  reminders: Reminder[]
  sectionId: string | null
  importance: number
  /** Días en que se repite (1 = lunes … 7 = domingo). Con ellos es una rutina; `null` = no se repite. */
  repeat: number[] | null
  /** Lugar nombrado que aún no está guardado ("al pasar por Mercadona"): se crea al añadir. */
  newPlace?: TaskDraft['newPlace']
}

export const blankDetails = (date: IsoDate | null): Details => ({
  date,
  time: null,
  duration: null,
  reminders: [],
  sectionId: null,
  importance: DEFAULT_IMPORTANCE,
  repeat: null,
})

/**
 * La ficha al desplegarla. `parsed`: lo entendido de la frase (si se aplica), que manda entero, día
 * incluido, como al añadirla sin ficha; `routine`: si la frase dice que se repite. `date` es el destino
 * elegido: el día de la ficha si no se entendió nada, y el de una rutina por si deja de repetirse.
 */
export function detailsFrom(
  parsed: TaskDraft | null,
  routine: { days: number[]; time: IsoTime | null } | null,
  date: IsoDate | null,
  newId: () => string,
): Details {
  if (routine) return { ...blankDetails(date), time: routine.time, repeat: cleanDays(routine.days) }
  if (!parsed) return blankDetails(date)
  return {
    ...blankDetails(parsed.date),
    time: parsed.date ? parsed.time : null,
    duration: parsed.date && parsed.time ? parsed.duration : null,
    reminders: parsed.reminders.map((reminder) => ({ ...reminder, id: newId() })),
    ...(parsed.newPlace ? { newPlace: parsed.newPlace } : {}),
  }
}

/** Sin hora, los avisos "antes" no tienen de qué ser antes. */
const withoutRelative = (reminders: Reminder[]) => reminders.filter((reminder) => reminder.kind !== 'before')

export function withDate(details: Details, date: IsoDate | null): Details {
  if (date !== null) return { ...details, date }
  return { ...details, date: null, time: null, duration: null, sectionId: null, reminders: withoutRelative(details.reminders) }
}

/**
 * Como al escribir "a las 5": poner hora trae el aviso "a la hora", salvo que ya haya uno relativo.
 * Una rutina tiene hora sin tener día, y su aviso va solo (uno cada día que toca).
 */
export function withTime(details: Details, time: IsoTime | null, newId: () => string): Details {
  if (time === null) return { ...details, time: null, duration: null, reminders: withoutRelative(details.reminders) }
  if (!isValidTime(time)) return details
  if (details.repeat) return { ...details, time }
  if (!details.date) return details
  const hasRelative = details.reminders.some((reminder) => reminder.kind === 'before')
  const reminders = hasRelative ? details.reminders : [...details.reminders, { id: newId(), kind: 'before' as const, minutes: 0 }]
  return { ...details, time, reminders }
}

export function withDuration(details: Details, duration: number | null): Details {
  if (!details.time) return details.duration === null ? details : { ...details, duration: null }
  return { ...details, duration: duration === null ? null : normalizeDuration(duration) }
}

export function addDetailReminder(details: Details, draft: ReminderDraft, id: string): Details {
  if (details.reminders.length >= MAX_REMINDERS || details.reminders.some((reminder) => sameReminder(reminder, draft))) {
    return details
  }
  return { ...details, reminders: [...details.reminders, { ...draft, id }] }
}

export const removeDetailReminder = (details: Details, id: string): Details => ({
  ...details,
  reminders: details.reminders.filter((reminder) => reminder.id !== id),
})

/** Las secciones agrupan dentro del día: sin fecha no hay sección. */
export const withSection = (details: Details, sectionId: string | null): Details => ({
  ...details,
  sectionId: details.date ? sectionId : null,
})

export const withImportance = (details: Details, importance: number): Details => ({
  ...details,
  importance: clampImportance(importance),
})

/** Sin días deja de repetirse: vuelve a ser una tarea, y sin fecha una tarea no tiene hora. */
export function withRepeat(details: Details, days: readonly number[] | null): Details {
  // `cleanDays` rellena una lista vacía con todos los días (una rutina nunca va sin días): aquí vacía es "no".
  const clean = days?.length ? cleanDays(days) : []
  if (clean.length) return { ...details, repeat: clean }
  return details.date ? { ...details, repeat: null } : { ...details, repeat: null, time: null, duration: null }
}

export const isRoutine = (details: Details): boolean => details.repeat !== null

/** La tarea tal como quedaría, para lo que ya sabe trabajar con tareas (los atajos de aviso, sus etiquetas). */
export function draftTask(details: Details, title: string): Task {
  return {
    id: 'draft',
    title,
    done: false,
    date: details.date,
    time: details.time,
    duration: details.duration,
    reminders: details.reminders,
    sectionId: details.sectionId,
    order: 0,
    importance: details.importance,
    createdAt: 0,
    completedAt: null,
  }
}

/** La tarea que se añade: el título limpio y los avisos sin su id provisional. */
export function toTaskDraft(details: Details, title: string): TaskDraft {
  return {
    title: title.trim(),
    date: details.date,
    time: details.time,
    duration: details.duration,
    reminders: details.reminders.map(({ id: _id, ...draft }) => draft as ReminderDraft),
    importance: details.importance,
    sectionId: details.sectionId,
    ...(details.newPlace ? { newPlace: details.newPlace } : {}),
  }
}

/** La rutina que se crea si se repite; `null` si no. */
export function toRoutineDraft(details: Details, title: string): RoutineDraft | null {
  if (!details.repeat) return null
  return { title: title.trim(), days: details.repeat, time: details.time, label: routineLabel(details.repeat, details.time) }
}

export type SummaryIcon = 'bell' | 'pin' | 'repeat' | 'size' | null

export interface SummaryItem {
  key: string
  label: string
  icon: SummaryIcon
}

/**
 * Lo decidido en la ficha, en pocas píldoras para la barra plegada (como el mini reproductor, que dice
 * qué suena): el día con su hora, los avisos, el lugar nuevo, la sección y la importancia.
 */
export function detailsSummary(
  details: Details,
  today: IsoDate,
  sections: readonly Section[],
  places: readonly Place[],
  now: number = Date.now(),
): SummaryItem[] {
  if (details.repeat) return [{ key: 'repeat', label: routineLabel(details.repeat, details.time), icon: 'repeat' }]

  const day = details.date ? relativeLabel(details.date, today) : 'Sin fecha'
  const items: SummaryItem[] = [
    { key: 'when', label: details.date && details.time ? `${day} · ${spanLabel(details.time, details.duration)}` : day, icon: null },
  ]
  const [only] = details.reminders
  if (details.reminders.length > 1) items.push({ key: 'reminders', label: `${details.reminders.length} avisos`, icon: 'bell' })
  else if (only) items.push({ key: 'reminders', label: reminderLabel(only, now, places), icon: only.kind === 'place' ? 'pin' : 'bell' })
  if (details.newPlace) items.push({ key: 'place', label: details.newPlace.name, icon: 'pin' })
  const section = details.sectionId ? sections.find((item) => item.id === details.sectionId) : undefined
  if (section) items.push({ key: 'section', label: section.name, icon: null })
  if (details.importance > DEFAULT_IMPORTANCE) items.push({ key: 'importance', label: String(details.importance), icon: 'size' })
  return items
}
