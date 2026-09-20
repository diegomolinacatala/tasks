import type { Placement } from '../lib/order'
import type { AppState, BlockId, IsoDate, IsoTime, PlaceLocation, ReminderDraft, Task } from '../types'

/** Una columna del tablero: adónde van las tareas que contiene. */
export interface Column {
  date: IsoDate | null
  sectionId: string | null
  ids: string[]
}

export type Action =
  | {
      type: 'task/add'
      title: string
      date: IsoDate | null
      sectionId: string | null
      time?: IsoTime | null
      reminders?: ReminderDraft[]
      /** Id fijado por quien crea la tarea, para poder deshacer. */
      id?: string
    }
  | { type: 'task/toggle'; id: string }
  | { type: 'task/setTime'; id: string; time: IsoTime | null }
  | { type: 'reminder/add'; taskId: string; reminder: ReminderDraft }
  | { type: 'reminder/remove'; taskId: string; reminderId: string }
  /** `now` viaja en la acción para que el reducer siga siendo puro. */
  | { type: 'task/snooze'; id: string; at: number; now: number }
  | { type: 'task/rename'; id: string; title: string }
  /** Del 1 al 10: el tamaño del título. */
  | { type: 'task/importance'; id: string; importance: number }
  /** Pasa pendientes a ese día, arriba de su sección (lo atrasado, a hoy). Ver `rescheduled`. */
  | { type: 'tasks/reschedule'; ids: string[]; date: IsoDate }
  /** Devuelve tareas a un sitio concreto: deshacer un `tasks/reschedule`. */
  | { type: 'tasks/place'; placements: Placement[] }
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
  | { type: 'place/add'; id: string; name: string; location?: PlaceLocation | null; radius?: number }
  | { type: 'place/update'; id: string; name?: string; location?: PlaceLocation | null; radius?: number }
  /** Quita también sus avisos de las tareas. */
  | { type: 'place/remove'; id: string }
  | { type: 'block/toggle'; block: BlockId }
  | { type: 'settings/digest'; enabled?: boolean; time?: IsoTime }
  | { type: 'state/replace'; state: AppState }
  | { type: 'state/clear' }
