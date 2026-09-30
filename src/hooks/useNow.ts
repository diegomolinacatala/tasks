import { useEffect, useState } from 'react'

const TICK_MS = 30_000

/** Minutos desde medianoche, al día cada medio minuto. `active: false` no pone ningún temporizador. */
export function useNowMinutes(active: boolean): number {
  const read = () => {
    const now = new Date()
    return now.getHours() * 60 + now.getMinutes()
  }
  const [minutes, setMinutes] = useState(read)

  useEffect(() => {
    if (!active) return
    const update = () => setMinutes(read())
    update()
    const timer = window.setInterval(update, TICK_MS)
    document.addEventListener('visibilitychange', update)
    return () => {
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', update)
    }
  }, [active])

  return minutes
}
