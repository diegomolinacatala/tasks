import { useEffect, useState } from 'react'
import { todayIso } from '../lib/date'
import { routineDay } from '../lib/routines'
import type { IsoDate, IsoTime } from '../types'

const CHECK_MS = 60_000

/** Un día que se recalcula cada minuto y al volver a la app: puede quedarse abierta toda la noche. */
function useDayOf(compute: () => IsoDate, key: string): IsoDate {
  const [day, setDay] = useState(compute)

  useEffect(() => {
    const check = () => setDay((current) => (compute() === current ? current : compute()))
    check()
    const timer = setInterval(check, CHECK_MS)
    document.addEventListener('visibilitychange', check)
    return () => {
      clearInterval(timer)
      document.removeEventListener('visibilitychange', check)
    }
  }, [key]) // eslint-disable-line react-hooks/exhaustive-deps

  return day
}

/** Hoy en el calendario: el día avanza solo a medianoche. */
export const useToday = (): IsoDate => useDayOf(todayIso, 'today')

/** Hoy para las rutinas: cambia a la hora en que empieza su día (`Settings.dayStart`). */
export const useRoutineDay = (dayStart: IsoTime): IsoDate => useDayOf(() => routineDay(Date.now(), dayStart), dayStart)
