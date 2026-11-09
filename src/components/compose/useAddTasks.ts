import { useCallback } from 'react'
import { createId } from '../../lib/id'
import { applyInbox, entryFromDrafts, entryTaskIds } from '../../lib/inbox'
import { MAX_PLACES } from '../../lib/places'
import { useAppState, useDispatch } from '../../state/StoreProvider'
import type { TaskDraft } from '../../types'
import { usePlaceEditor } from '../places/PlaceEditor'

/**
 * Crea tareas desde el compositor, el dictado o Siri. Si nombran un lugar que aún no existe
 * ("al pasar por Mercadona"), lo crea y abre su editor buscando ese nombre en Mapas: sin
 * ubicación el aviso no podría sonar. Es lo mismo que aplicar una entrada de la bandeja.
 */
export function useAddTasks() {
  const state = useAppState()
  const dispatch = useDispatch()
  const openPlace = usePlaceEditor()

  return useCallback(
    (drafts: readonly TaskDraft[]): { tasks: string[]; places: string[] } => {
      const entry = entryFromDrafts(drafts, state.places, createId, Date.now())
      applyInbox(state, [entry]).actions.forEach(dispatch)
      const [firstNew] = entry.places
      // Al tope de lugares el reducer no lo crea: abrir su panel sería abrir uno vacío.
      if (firstNew && state.places.length < MAX_PLACES) openPlace({ placeId: firstNew.id })
      return { tasks: entryTaskIds(entry), places: entry.places.map((place) => place.id) }
    },
    [state, dispatch, openPlace],
  )
}
