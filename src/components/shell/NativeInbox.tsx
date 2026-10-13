import { useCallback, useEffect, useRef } from 'react'
import { relativeLabel, shortTime, todayIso } from '../../lib/date'
import { pick } from '../../lib/i18n'
import { INBOX_EVENT, applyInbox } from '../../lib/inbox'
import { capitalize } from '../../lib/title'
import { markApplied, readInbox } from '../../lib/platform/inbox'
import { useAppState, useDispatch } from '../../state/StoreProvider'
import { usePlaceEditor } from '../places/PlaceEditor'
import { requestOpenTask } from '../task/rowActions'
import { useToast } from '../ui/Toast'

const TEXT = {
  es: { where: (name: string) => `¿Dónde está ${name}?`, choose: 'Elegir', inbox: 'Bandeja', view: 'Ver', several: (count: number) => `${count} tareas apuntadas` },
  en: { where: (name: string) => `Where is ${name}?`, choose: 'Choose', inbox: 'Inbox', view: 'View', several: (count: number) => `${count} tasks noted` },
} as const

/**
 * Lo apuntado con Siri o Atajos mientras la app seguía viva (delante o en segundo plano). Al
 * arrancar lo aplica ya `loadState`; aquí se recoge al volver a primer plano y en cuanto el lado
 * nativo avisa (`INBOX_EVENT`). Solo iPhone. No pinta nada.
 */
export function NativeInbox() {
  const state = useAppState()
  const dispatch = useDispatch()
  const toast = useToast()
  const openPlace = usePlaceEditor()
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
        const text = pick(TEXT)
        // Un lugar nuevo dicho a Siri nace sin ubicar y su aviso no sonaría: con la app delante, se ofrece ubicarlo.
        const [place] = applied.entries.flatMap((entry) => entry.places)
        if (place) {
          toast({ message: text.where(place.name), actionLabel: text.choose, onAction: () => openPlace({ placeId: place.id }) })
          continue
        }
        // Lo apuntado con la app delante no debe entrar en silencio: qué es y adónde ha ido.
        const added = applied.actions.flatMap((action) => (action.type === 'task/add' && action.id ? [{ ...action, id: action.id }] : []))
        const [first] = added
        if (!first) continue
        const today = todayIso()
        const { date, time } = first
        const where = date ? `${capitalize(relativeLabel(date, today))}${time ? ` ${shortTime(time)}` : ''}` : text.inbox
        const message = added.length === 1 ? `${first.title} → ${where}` : text.several(added.length)
        const id = first.id
        toast({ message, actionLabel: text.view, onAction: () => requestOpenTask(id) })
      } while (again.current)
    } catch {
      // Sin bandeja legible no hay nada que aplicar; se reintenta al volver a primer plano.
    } finally {
      running.current = false
    }
  }, [dispatch, toast, openPlace])

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
