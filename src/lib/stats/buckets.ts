/**
 * Tramos de las distribuciones: el móvil no manda una cifra exacta sino en qué tramo cae. La clave es
 * el límite de arriba (`600` = de 300 a 600 ms). Los mismos que pinta el panel (`worker/panel/uso`).
 */

const bucket = (limits: readonly number[]) => (value: number) => {
  const found = limits.find((limit) => value < limit)
  return found === undefined ? 'inf' : String(found)
}

/** Arranque en frío, en ms: desde que se carga la página hasta que se pinta la app. */
export const bootBucket = bucket([300, 600, 1000, 2000, 4000])

/** Del toque al siguiente fotograma, en ms. */
export const latencyBucket = bucket([50, 100, 200, 500])

/** Lo que dura una visita, en segundos. */
export const sessionBucket = bucket([10, 30, 60, 180, 600])

/** La hora (local) a la que empieza una visita: `00`…`23`. */
export const hourBucket = (date: Date): string => String(date.getHours()).padStart(2, '0')

/** Un toque que tarda más que esto en pintar algo cuenta como lento en su elemento. */
export const SLOW_MS = 200
