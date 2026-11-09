/**
 * La portada de la bienvenida, para quien ya usa la app: un saludo según la hora y su cuaderno (lo hecho,
 * la racha viva más larga y sus lugares), sacado de lo guardado en el dispositivo. Nada sale de él.
 */
import type { AppState, IsoDate } from '../types'
import { diffDays, isoOfInstant } from './date'
import type { Language } from './i18n'
import { language, pick } from './i18n'
import { streak } from './routines'

/** Por debajo de esto el cuaderno no dice nada que valga la pena enseñar. */
export const RECAP_MIN_DONE = 3
/** Una racha de un día no es una racha. */
export const RECAP_MIN_STREAK = 2
/**
 * Antes de esto Tasks no existía: una fecha de creación anterior (un 0 de una copia rota) no dice desde
 * cuándo, y el cuaderno diría «desde el 1 de enero de 1970».
 */
const EARLIEST_CREATED = Date.UTC(2025, 0, 1)

export interface RecapStreak {
  days: number
  emoji: string | null
}

export interface Recap {
  /** Lo más antiguo que se conserva (tarea o rutina): desde cuándo lleva el cuaderno. */
  since: IsoDate
  /** Días desde entonces, hoy incluido. */
  days: number
  /** Tareas tachadas que siguen guardadas. */
  done: number
  /** La racha viva más larga de sus rutinas, si llega a `RECAP_MIN_STREAK`. */
  streak: RecapStreak | null
  places: number
  routines: number
}

/**
 * Lo que cuenta el cuaderno, o `null` si aún no hay de qué hablar (una instalación nueva, o casi). `today`
 * es el día de las rutinas (`routineDay`): una racha no se corta de madrugada.
 */
export function recapOf(state: Pick<AppState, 'tasks' | 'routines' | 'places'>, today: IsoDate): Recap | null {
  const done = state.tasks.reduce((count, task) => (task.done ? count + 1 : count), 0)
  const best = state.routines.reduce<RecapStreak | null>((current, routine) => {
    const days = streak(routine, today)
    return days >= RECAP_MIN_STREAK && days > (current?.days ?? 0) ? { days, emoji: routine.emoji } : current
  }, null)
  if (done < RECAP_MIN_DONE && !best) return null
  const first = [...state.tasks, ...state.routines].reduce(
    (oldest, item) => (item.createdAt >= EARLIEST_CREATED ? Math.min(oldest, item.createdAt) : oldest),
    Infinity,
  )
  const since = Number.isFinite(first) ? isoOfInstant(first) : today
  const start = since < today ? since : today
  return {
    since: start,
    days: diffDays(start, today) + 1,
    done,
    streak: best,
    places: state.places.length,
    routines: state.routines.length,
  }
}

export type DayPart = 'morning' | 'afternoon' | 'night'

/**
 * La parte del día en que se saluda. En España la tarde dura hasta la cena (las 21:00); en inglés, el
 * *evening* empieza a las 18:00.
 */
export function dayPart(hour: number, lang: Language): DayPart {
  if (hour >= 6 && hour < (lang === 'en' ? 12 : 13)) return 'morning'
  if (hour >= 6 && hour < (lang === 'en' ? 18 : 21)) return 'afternoon'
  return 'night'
}

const GREETINGS = {
  es: { morning: 'Buenos días', afternoon: 'Buenas tardes', night: 'Buenas noches' },
  en: { morning: 'Good morning', afternoon: 'Good afternoon', night: 'Good evening' },
} as const

/** «Buenas tardes» · «Good afternoon», en el idioma vigente. */
export const greeting = (hour: number): string => pick(GREETINGS)[dayPart(hour, language())]
