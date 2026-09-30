import type { IsoDate } from '../types'
import { addDays, dayNameShort, dayNumber } from './date'

/** Un sitio donde dejar lo escrito en el compositor: "Hoy", "Mañana", "Jue 2", "Sin fecha". */
export interface ComposeTarget {
  label: string
  date: IsoDate | null
}

const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1)

/**
 * Los destinos del compositor, en orden. El primero es donde se está mirando (`here`: el día
 * elegido en la Agenda, `null` en la Bandeja) y va elegido de entrada; detrás, los de siempre (hoy,
 * mañana y sin fecha), sin repetir el primero.
 */
export function composeTargets(here: IsoDate | null, today: IsoDate): ComposeTarget[] {
  const usual: ComposeTarget[] = [
    { label: 'Hoy', date: today },
    { label: 'Mañana', date: addDays(today, 1) },
    { label: 'Sin fecha', date: null },
  ]
  const current = usual.find((target) => target.date === here) ?? {
    label: here ? `${capitalize(dayNameShort(here))} ${dayNumber(here)}` : 'Sin fecha',
    date: here,
  }
  return [current, ...usual.filter((target) => target.date !== here)]
}
