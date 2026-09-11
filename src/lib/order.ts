import type { IsoDate, Task } from '../types'

/**
 * El campo `order` es relativo a un "scope":
 *  - tareas con fecha  -> un scope por (día, sección): se ordenan dentro de su bloque
 *  - tareas sin fecha  -> un único scope `backlog`: lista plana
 */
export const BACKLOG_SCOPE = 'backlog'

export function scopeKey(date: IsoDate | null, sectionId: string | null): string {
  return date ? `${date}::${sectionId ?? 'root'}` : BACKLOG_SCOPE
}

export const scopeOf = (task: Pick<Task, 'date' | 'sectionId'>) => scopeKey(task.date, task.sectionId)

/** Orden persistido. */
export const byOrder = (a: Task, b: Task) => a.order - b.order || a.createdAt - b.createdAt

/** Orden en pantalla: lo completado cae al final de su bloque. */
export const byDisplay = (a: Task, b: Task) => Number(a.done) - Number(b.done) || byOrder(a, b)

export function inScope(tasks: readonly Task[], scope: string): Task[] {
  return tasks.filter((task) => scopeOf(task) === scope).sort(byOrder)
}

export function nextOrder(tasks: readonly Task[], scope: string): number {
  return inScope(tasks, scope).reduce((max, task) => Math.max(max, task.order + 1), 0)
}

/**
 * Reescribe `order` dentro de un scope según `orderedIds`.
 * Las tareas del scope no mencionadas conservan su orden relativo, al final.
 */
export function applyOrder(tasks: readonly Task[], scope: string, orderedIds: readonly string[]): Task[] {
  const rank = new Map(orderedIds.map((id, index) => [id, index]))
  inScope(tasks, scope)
    .filter((task) => !rank.has(task.id))
    .forEach((task, index) => rank.set(task.id, orderedIds.length + index))

  return tasks.map((task) => {
    if (scopeOf(task) !== scope) return task
    const order = rank.get(task.id)
    return order === undefined || order === task.order ? task : { ...task, order }
  })
}

/** Mueve una tarea a otro día/sección (o dentro del mismo) insertándola en `index`. */
export function moveTask(
  tasks: readonly Task[],
  id: string,
  target: { date: IsoDate | null; sectionId: string | null },
  index = Number.POSITIVE_INFINITY,
): Task[] {
  const current = tasks.find((task) => task.id === id)
  if (!current) return tasks as Task[]

  const moved: Task = { ...current, date: target.date, sectionId: target.sectionId }
  const fromScope = scopeOf(current)
  const toScope = scopeOf(moved)

  const rest = tasks.filter((task) => task.id !== id)
  const targetIds = inScope(rest, toScope).map((task) => task.id)
  const at = Math.max(0, Math.min(index, targetIds.length))
  const orderedIds = [...targetIds.slice(0, at), id, ...targetIds.slice(at)]

  const withMoved = [...rest, moved]
  const reordered = applyOrder(withMoved, toScope, orderedIds)
  if (fromScope === toScope) return reordered

  return applyOrder(reordered, fromScope, inScope(reordered, fromScope).map((task) => task.id))
}
