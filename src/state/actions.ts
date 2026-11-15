import type { Placement } from '../lib/order'
import type { SyncChange } from '../lib/sync/records'
import type { AppState, BlockId, HerePoint, IsoDate, IsoTime, Place, PlaceLocation, LanguageSetting, Reminder, ReminderDraft, Routine, SharedBasket, ShoppingItem, StatsLevel, Task, Theme } from '../types'

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
      /** Final del plazo ("esta semana"): solo cuenta si va después de `date`. */
      until?: IsoDate | null
      sectionId: string | null
      time?: IsoTime | null
      duration?: number | null
      reminders?: ReminderDraft[]
      /** Del 1 al 10 (la ficha del compositor); sin ella, la normal. */
      importance?: number
      /** Id fijado por quien crea la tarea, para poder deshacer. */
      id?: string
    }
  | { type: 'task/toggle'; id: string }
  | { type: 'task/setTime'; id: string; time: IsoTime | null }
  /** Último día del plazo (`lib/period.ts`); `null` lo quita y la tarea vuelve a ser solo de su día. */
  | { type: 'task/until'; id: string; until: IsoDate | null }
  /** Minutos que dura; al acabar se pregunta si ya está hecha. `null` = sin duración. */
  | { type: 'task/setDuration'; id: string; duration: number | null }
  /**
   * Soltada en el horario: ese día (conserva su sección) a esa hora, con esa duración. Como al escribir
   * "a las 5", con hora y sin avisos relativos se avisa a la hora: `reminderId` es el de ese aviso, para
   * poder quitarlo al deshacer.
   */
  | { type: 'task/schedule'; id: string; date: IsoDate; time: IsoTime; duration: number | null; reminderId?: string }
  /** "Todavía no": alarga la tarea para que vuelva a preguntar dentro de un rato. */
  | { type: 'task/extend'; id: string; now: number }
  | { type: 'reminder/add'; taskId: string; reminder: ReminderDraft }
  | { type: 'reminder/remove'; taskId: string; reminderId: string }
  /**
   * Un aviso "al alejarme": su radio y el punto desde el que cuenta (`null` lo deja sin fijar). Fijar el
   * punto reinicia `since` a `now`: la caducidad cuenta desde que se sabe dónde se está.
   */
  | { type: 'reminder/here'; taskId: string; reminderId: string; radius?: number; from?: HerePoint | null; now?: number }
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
  /** Sin `until`, el plazo sigue si acaba después del día nuevo (`moveTask`). */
  | { type: 'task/move'; id: string; date: IsoDate | null; sectionId: string | null; index?: number; until?: IsoDate | null }
  /** Resultado de un arrastre: reescribe día, sección y orden de golpe. */
  | { type: 'board/commit'; columns: Column[] }
  | { type: 'scope/reorder'; scope: string; ids: string[] }
  | { type: 'section/add'; name: string; id?: string }
  | { type: 'section/rename'; id: string; name: string }
  | { type: 'section/remove'; id: string }
  | { type: 'section/toggle'; id: string }
  | { type: 'sections/reorder'; ids: string[] }
  | { type: 'place/add'; id: string; name: string; aliases?: string[]; location?: PlaceLocation | null; radius?: number }
  /** Los otros nombres que choquen con otro lugar se descartan. */
  | { type: 'place/update'; id: string; name?: string; aliases?: string[]; location?: PlaceLocation | null; radius?: number }
  /** Quita también sus avisos de las tareas. */
  | { type: 'place/remove'; id: string }
  /**
   * Deshacer un borrado: vuelve el lugar y los avisos que se llevó (los de tareas que sigan existiendo);
   * `shopping`, si la cesta avisaba al llegar a él.
   */
  | {
      type: 'place/restore'
      place: Place
      reminders: readonly { taskId: string; reminder: Reminder }[]
      shopping?: true
      /** Las cestas compartidas que avisaban al llegar a él. */
      baskets?: readonly string[]
    }
  | { type: 'routine/add'; title: string; days: number[]; time: IsoTime | null; emoji?: string | null; id?: string }
  /** `emoji: null` lo quita; sin el campo, se queda como está. */
  | { type: 'routine/update'; id: string; title?: string; days?: number[]; time?: IsoTime | null; emoji?: string | null }
  /** Tacha o destacha la rutina ese día. */
  | { type: 'routine/toggle'; id: string; date: IsoDate }
  /** Deja el día como se dice (lo marcado desde el widget o un aviso): repetirlo no cambia nada. */
  | { type: 'routine/set'; id: string; date: IsoDate; done: boolean }
  | { type: 'routine/remove'; id: string }
  | { type: 'routine/restore'; routine: Routine }
  /**
   * La cesta (`lib/shopping.ts`). Añadir algo que ya está pendiente no duplica (con cantidad, la cambia);
   * algo ya comprado vuelve a pendiente. `basket`: una cesta compartida (su id); sin él, la propia.
   */
  | { type: 'shopping/add'; name: string; qty?: string | null; id?: string; now: number; basket?: string }
  /** Comprar o devolver a pendiente; al comprar se apunta en el historial (las habituales). */
  | { type: 'shopping/toggle'; id: string; now: number; basket?: string }
  | { type: 'shopping/remove'; id: string; basket?: string }
  | { type: 'shopping/restore'; item: ShoppingItem; basket?: string }
  /** Vaciar lo comprado. */
  | { type: 'shopping/clearDone'; basket?: string }
  /** El lugar guardado al que, al llegar, avisa con lo pendiente; `null` lo quita. */
  | { type: 'shopping/place'; placeId: string | null; basket?: string }
  /** Una cesta compartida nueva (creada o a la que te has unido). Si ya estaba, no cambia. */
  | { type: 'basket/add'; basket: SharedBasket }
  | { type: 'basket/rename'; id: string; name: string }
  /** El servidor dice otra cosa de quién manda (el dueño salió y has pasado a serlo). */
  | { type: 'basket/owner'; id: string; owner: boolean }
  /** Ya no eres de ella (has salido o te han echado): desaparece de este dispositivo. */
  | { type: 'basket/remove'; id: string }
  /**
   * Lo que llega de otro dispositivo o de otro miembro (`lib/sync/records.ts`): `scope` es `personal` o el
   * id de una cesta compartida; cada cambio, un registro con su valor o `null` si se ha borrado.
   */
  | { type: 'sync/apply'; scope: string; changes: readonly SyncChange[] }
  /**
   * Al vincular este dispositivo a un grupo: lo de los vinculados manda. Se vacía lo que se sincroniza y se
   * quedan los ajustes de este dispositivo; lo del grupo llega después con `sync/apply`.
   */
  | { type: 'sync/adopt' }
  | { type: 'block/toggle'; block: BlockId }
  | { type: 'settings/digest'; enabled?: boolean; time?: IsoTime }
  | { type: 'settings/dictation'; allowed: boolean }
  /** Estadísticas anónimas: qué se manda (`level`) y la cohorte, que se fija con el primer envío. */
  | { type: 'settings/stats'; level?: StatsLevel; cohort?: IsoDate }
  | { type: 'settings/theme'; theme: Theme }
  | { type: 'settings/language'; language: LanguageSetting }
  | { type: 'settings/dayStart'; time: IsoTime }
  /** El calendario del iPhone en la Agenda: enseñarlo o no y qué calendarios se ocultan. */
  | { type: 'settings/calendar'; enabled?: boolean; hidden?: string[]; export?: string | null }
  /** Marca o desmarca como hecho un evento del calendario (su clave, `id@inicio`), solo en este dispositivo. */
  | { type: 'event/set'; key: string; done: boolean }
  /** Se ha cerrado la bienvenida de esa versión (`lib/welcome.ts`). */
  | { type: 'settings/welcome'; version: number }
  | { type: 'state/replace'; state: AppState }
  /** Importar una copia: como `state/replace`, salvo el permiso del dictado, que es de este dispositivo. */
  | { type: 'state/import'; state: AppState }
  | { type: 'state/clear' }
