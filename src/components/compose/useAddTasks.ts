import { useCallback } from 'react'
import { createId } from '../../lib/id'
import { findPlace, placeKey } from '../../lib/places'
import { useAppState, useDispatch } from '../../state/StoreProvider'
import type { ReminderDraft } from '../../types'
import { usePlaceEditor } from '../places/PlaceEditor'
import type { TaskDraft } from './Composer'

/**
 * Crea tareas desde el compositor, el dictado o Siri. Si nombran un lugar que aún no existe
 * ("al pasar por Mercadona"), lo crea y abre su editor buscando ese nombre en Mapas: sin
 * ubicación el aviso no podría sonar.
 */
export function useAddTasks() {
  const state = useAppState()
  const dispatch = useDispatch()
  const openPlace = usePlaceEditor()

  return useCallback(
    (drafts: readonly TaskDraft[]): string[] => {
      // Varias tareas pueden nombrar el mismo lugar nuevo: se crea una sola vez.
      const created = new Map<string, string>()

      const ids = drafts.map((draft) => {
        let reminders: ReminderDraft[] = draft.reminders
        if (draft.newPlace) {
          const key = placeKey(draft.newPlace.name)
          const placeId = findPlace(state.places, draft.newPlace.name)?.id ?? created.get(key) ?? createId()
          if (!findPlace(state.places, draft.newPlace.name) && !created.has(key)) {
            dispatch({ type: 'place/add', id: placeId, name: draft.newPlace.name })
            created.set(key, placeId)
          }
          reminders = [...reminders, { kind: 'place', placeId, on: draft.newPlace.on }]
        }
        const id = createId()
        dispatch({ type: 'task/add', id, title: draft.title, date: draft.date, time: draft.time, reminders, sectionId: null })
        return id
      })

      const [firstNew] = created.values()
      if (firstNew) openPlace({ placeId: firstNew })
      return ids
    },
    [state.places, dispatch, openPlace],
  )
}
