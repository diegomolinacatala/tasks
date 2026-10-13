import type { Task } from '../types'

/**
 * Importancia de una tarea: una escala del 1 al 10 que se ve como el tamaño del título. No hay
 * etiquetas ni colores: lo importante se lee antes porque es más grande. 1 = normal.
 */
export const MIN_IMPORTANCE = 1
export const MAX_IMPORTANCE = 10
export const DEFAULT_IMPORTANCE = MIN_IMPORTANCE

/** Lo que hay que arrastrar el mando para subir o bajar un punto. */
export const IMPORTANCE_STEP_PX = 18

export const clampImportance = (value: number): number =>
  Math.min(MAX_IMPORTANCE, Math.max(MIN_IMPORTANCE, Math.round(value)))

/** Lo que llega de fuera (copia, fichero): si no es un número, vale lo normal. */
export const normalizeImportance = (raw: unknown): number =>
  typeof raw === 'number' && Number.isFinite(raw) ? clampImportance(raw) : DEFAULT_IMPORTANCE

/**
 * Cuánto crece el título, de 0 (normal) a 1 (`--fs-task-max`, el doble de `--fs-md`). La
 * progresión es geométrica: cada punto multiplica el tamaño por lo mismo, así que de 1 a 2 se nota
 * tanto como de 9 a 10.
 */
export function importanceScale(level: number): number {
  const steps = clampImportance(level) - MIN_IMPORTANCE
  return 2 ** (steps / (MAX_IMPORTANCE - MIN_IMPORTANCE)) - 1
}

/** Arrastrar el mando a la derecha sube un punto cada 18 px y a la izquierda lo baja; lo vertical es scroll. */
export const importanceFromDrag = (start: number, dx: number): number =>
  clampImportance(start + Math.round(dx / IMPORTANCE_STEP_PX))

/** Tocar el mando sin arrastrar sube un punto; en el 10 se queda (volver al 1 de golpe sorprendía). */
export const nextImportance = (level: number): number => clampImportance(clampImportance(level) + 1)

/** Más importante primero; a igualdad, el orden que ya traían. `Array.prototype.sort` es estable. */
export const byImportance = (a: Pick<Task, 'importance'>, b: Pick<Task, 'importance'>): number =>
  b.importance - a.importance
