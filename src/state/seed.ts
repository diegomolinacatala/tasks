import { createId } from '../lib/id'
import { formatTime, todayIso } from '../lib/date'
import { DEFAULT_IMPORTANCE } from '../lib/importance'
import type { AppState, IsoDate, IsoTime, Task } from '../types'
import { SCHEMA_VERSION, defaultSettings } from './reducer'

interface Seed {
  title: string
  date: IsoDate | null
  time?: IsoTime
  duration?: number
  importance?: number
}

/** La siguiente hora en punto, si aún cabe en el día: para que el horario enseñe algo. */
function nextHour(now: Date): IsoTime | null {
  const hour = now.getHours() + 1
  return hour <= 22 ? formatTime(hour, 0) : null
}

/**
 * Primer arranque: tareas que enseñan los gestos y dónde va cada cosa, y que se borran al usarlas.
 * La del "Aa" ya viene grande: enseña la importancia con su propio tamaño.
 */
export function seedState(now: Date = new Date()): AppState {
  const date = todayIso(now)
  const hour = nextHour(now)
  const seeds: Seed[] = [
    ...(hour ? [{ title: 'Lo que tiene hora va al horario', date, time: hour, duration: 60 }] : []),
    { title: 'Desliza a la derecha para completar', date },
    { title: 'Desliza a la izquierda para borrar', date },
    { title: 'Arrastra por el asa y suéltala en otro día de la semana', date },
    { title: 'Toca la A de arriba y desliza el número para agrandar lo importante', date, importance: 5 },
    { title: 'Escribe «cada día a las 10» y se convierte en rutina', date: null },
  ]

  const tasks: Task[] = seeds.map(({ title, date: day, time, duration, importance }, order) => ({
    id: createId(),
    title,
    done: false,
    date: day,
    time: time ?? null,
    duration: duration ?? null,
    reminders: [],
    sectionId: null,
    order,
    importance: importance ?? DEFAULT_IMPORTANCE,
    createdAt: now.getTime() + order,
    completedAt: null,
  }))

  return {
    schemaVersion: SCHEMA_VERSION,
    tasks,
    sections: [],
    places: [],
    routines: [],
    collapsed: { overdue: false, backlog: false, routines: false },
    settings: defaultSettings(),
  }
}
