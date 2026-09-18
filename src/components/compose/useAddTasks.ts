import { useCallback } from 'react'
import { createId } from '../../lib/id'
import { applyInbox, entryFromDrafts, entryTaskIds } from '../../lib/inbox'
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
    (drafts: readonly TaskDraft[]): string[] => {
      const entry = entryFromDrafts(drafts, state.places, createId, Date.now())
      applyInbox(state, [entry]).actions.forEach(dispatch)
      const [firstNew] = entry.places
      if (firstNew) openPlace({ placeId: firstNew.id })
      return entryTaskIds(entry)
    },
    [state, dispatch, openPlace],
  )
}
