import { useCallback } from 'react'
import { useAppState, useDispatch } from '../../state/StoreProvider'
import { useToast } from '../ui/Toast'

export function useTaskActions() {
  const state = useAppState()
  const dispatch = useDispatch()
  const toast = useToast()

  const toggle = useCallback((id: string) => dispatch({ type: 'task/toggle', id }), [dispatch])

  const remove = useCallback(
    (id: string) => {
      const task = state.tasks.find((item) => item.id === id)
      if (!task) return
      dispatch({ type: 'task/remove', id })
      toast({
        message: 'Tarea borrada',
        actionLabel: 'Deshacer',
        onAction: () => dispatch({ type: 'task/restore', task }),
      })
    },
    [state.tasks, dispatch, toast],
  )

  return { toggle, remove }
}
