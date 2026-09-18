import { useCallback, useEffect, useRef } from 'react'
import { INBOX_EVENT, applyInbox } from '../../lib/inbox'
import { markApplied, readInbox } from '../../lib/platform/inbox'
import { useAppState, useDispatch } from '../../state/StoreProvider'

/**
 * Lo apuntado con Siri o Atajos mientras la app seguía viva (delante o en segundo plano). Al
 * arrancar lo aplica ya `loadState`; aquí se recoge al volver a primer plano y en cuanto el lado
 * nativo avisa (`INBOX_EVENT`). Solo iPhone. No pinta nada.
 */
export function NativeInbox() {
  const state = useAppState()
  const dispatch = useDispatch()
  const stateRef = useRef(state)
  const running = useRef(false)
  const again = useRef(false)

  useEffect(() => {
    stateRef.current = state
  }, [state])

  const pull = useCallback(async () => {
    // Un aviso que llega mientras se lee podría quedarse fuera de esta lectura: se lee otra vez.
    if (running.current) {
      again.current = true
      return
    }
    running.current = true
    try {
      do {
        again.current = false
        const entries = await readInbox()
        if (!entries.length) continue
        const applied = applyInbox(stateRef.current, entries)
        markApplied(applied.entries)
        applied.actions.forEach(dispatch)
      } while (again.current)
    } catch {
      // Sin bandeja legible no hay nada que aplicar; se reintenta al volver a primer plano.
    } finally {
      running.current = false
    }
  }, [dispatch])

  useEffect(() => {
    void pull()
    const onVisibility = () => {
      if (document.visibilityState === 'visible') void pull()
    }
    const onInbox = () => void pull()
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener(INBOX_EVENT, onInbox)
    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener(INBOX_EVENT, onInbox)
    }
  }, [pull])

  return null
}
