import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useReducer, useRef, useState } from 'react'
import type { Dispatch, ReactNode } from 'react'
import { captureLayout, changesLayout, playLayout } from '../lib/flip'
import { createPersister, loadState } from '../lib/persistence'
import type { AppState } from '../types'
import type { Action } from './actions'
import { emptyState, reducer } from './reducer'
import { seedState } from './seed'

const StateContext = createContext<AppState | null>(null)
const DispatchContext = createContext<Dispatch<Action> | null>(null)

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, rawDispatch] = useReducer(reducer, null, emptyState)
  const [hydrated, setHydrated] = useState(false)
  const persister = useRef(createPersister()).current

  // Lo que mueve filas se anota antes y se anima después de pintar (lib/flip.ts): así completar,
  // borrar o pasar a hoy desliza la lista desde cualquier sitio que despache la acción.
  const dispatch = useCallback<Dispatch<Action>>((action) => {
    if (changesLayout(action.type)) captureLayout()
    rawDispatch(action)
  }, [])

  useLayoutEffect(() => {
    playLayout()
  }, [state])

  useEffect(() => {
    let cancelled = false
    void loadState().then((stored) => {
      if (cancelled) return
      dispatch({ type: 'state/replace', state: stored ?? seedState() })
      setHydrated(true)
    })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (hydrated) persister.save(state)
  }, [state, hydrated, persister])

  useEffect(() => {
    const flush = () => persister.flush()
    // El sistema puede matar la pestaña sin previo aviso al pasar a segundo plano.
    window.addEventListener('pagehide', flush)
    document.addEventListener('visibilitychange', flush)
    return () => {
      window.removeEventListener('pagehide', flush)
      document.removeEventListener('visibilitychange', flush)
      flush()
    }
  }, [persister])

  const value = useMemo(() => state, [state])

  if (!hydrated) return null

  return (
    <StateContext.Provider value={value}>
      <DispatchContext.Provider value={dispatch}>{children}</DispatchContext.Provider>
    </StateContext.Provider>
  )
}

export function useAppState(): AppState {
  const state = useContext(StateContext)
  if (!state) throw new Error('useAppState debe usarse dentro de <StoreProvider>')
  return state
}

export function useDispatch(): Dispatch<Action> {
  const dispatch = useContext(DispatchContext)
  if (!dispatch) throw new Error('useDispatch debe usarse dentro de <StoreProvider>')
  return dispatch
}
