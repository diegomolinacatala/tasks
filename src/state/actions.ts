import type { AppState, BlockId, IsoDate, Task } from '../types'

/** Una columna del tablero: adónde van las tareas que contiene. */
export interface Column {
  date: IsoDate | null
  sectionId: string | null
  ids: string[]
}

export type Action =
  | { type: 'task/add'; title: string; date: IsoDate | null; sectionId: string | null }
  | { type: 'task/toggle'; id: string }
  | { type: 'task/rename'; id: string; title: string }
  | { type: 'task/remove'; id: string }
  | { type: 'task/restore'; task: Task }
  | { type: 'task/move'; id: string; date: IsoDate | null; sectionId: string | null; index?: number }
  /** Resultado de un arrastre: reescribe día, sección y orden de golpe. */
  | { type: 'board/commit'; columns: Column[] }
  | { type: 'scope/reorder'; scope: string; ids: string[] }
  | { type: 'section/add'; name: string; id?: string }
  | { type: 'section/rename'; id: string; name: string }
  | { type: 'section/remove'; id: string }
  | { type: 'section/toggle'; id: string }
  | { type: 'sections/reorder'; ids: string[] }
  | { type: 'block/toggle'; block: BlockId }
  | { type: 'state/replace'; state: AppState }
  | { type: 'state/clear' }
