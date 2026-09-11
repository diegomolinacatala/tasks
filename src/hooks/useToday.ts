import { useEffect, useState } from 'react'
import { todayIso } from '../lib/date'
import type { IsoDate } from '../types'

const CHECK_MS = 60_000

/** La app puede quedarse abierta toda la noche: el día tiene que avanzar solo. */
export function useToday(): IsoDate {
  const [day, setDay] = useState(todayIso)

  useEffect(() => {
    const check = () => setDay((current) => (todayIso() === current ? current : todayIso()))
    const timer = setInterval(check, CHECK_MS)
    document.addEventListener('visibilitychange', check)
    return () => {
      clearInterval(timer)
      document.removeEventListener('visibilitychange', check)
    }
  }, [])

  return day
}
