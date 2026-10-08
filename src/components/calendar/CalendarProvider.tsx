import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type { CalendarEvent, CalendarInfo, CalendarStatus, DayEvents, EventWindow } from '../../lib/calendar'
import { addedCalendars, eventWindow, eventsOfDay, windowCovers } from '../../lib/calendar'
import { fromIso, todayIso } from '../../lib/date'
import type { CalendarSource } from '../../lib/platform/calendar'
import { calendarSource, showsCalendar } from '../../lib/platform/calendar'
import { useCopy } from '../../state/LanguageProvider'
import { useAppState, useDispatch } from '../../state/StoreProvider'
import type { IsoDate } from '../../types'
import { useToast } from '../ui/Toast'

/** Varios cambios seguidos del calendario (una cuenta que se sincroniza) se leen una sola vez. */
const CHANGE_DEBOUNCE_MS = 350

export interface CalendarApi {
  /** Esta plataforma tiene calendario (el iPhone; en local, el de muestra). */
  available: boolean
  /** `unknown` mientras se pregunta a iOS. */
  status: CalendarStatus | 'unknown'
  /** Se enseña: hay permiso y está encendido en Ajustes. */
  active: boolean
  calendars: CalendarInfo[]
  events: CalendarEvent[]
  /** Sube con cada cambio del calendario: quien lea por su cuenta (el widget) sabe cuándo volver a leer. */
  revision: number
  /** Asegura que los eventos de ese día están pedidos. */
  watch: (day: IsoDate) => void
  /** Pide el permiso y, si se concede, enciende el calendario. */
  connect: () => Promise<CalendarStatus>
  open: (event: CalendarEvent) => void
  /** La fuente, para quien necesita leer otros días (el widget). `null` hasta que carga o si no hay. */
  source: CalendarSource | null
}

const INACTIVE: CalendarApi = {
  available: false,
  status: 'unknown',
  active: false,
  calendars: [],
  events: [],
  revision: 0,
  watch: () => undefined,
  connect: async () => 'denied',
  open: () => undefined,
  source: null,
}

const CalendarContext = createContext<CalendarApi>(INACTIVE)

const COPY = {
  es: { added: (source: string, count: number) => `${source}: ${count === 1 ? 'un calendario nuevo' : `${count} calendarios nuevos`} en la Agenda` },
  en: { added: (source: string, count: number) => `${source}: ${count === 1 ? 'a new calendar' : `${count} new calendars`} in your Agenda` },
} as const

/**
 * El calendario del iPhone para toda la app: el permiso, sus calendarios y los eventos del mes que se
 * mira. Se vuelve a leer al cambiar algo en él (iOS avisa), al volver a la app (quizá se añadió una
 * cuenta en Ajustes: si trae calendarios nuevos, un aviso lo dice) y al pasar a otro mes.
 */
export function CalendarProvider({ children }: { children: ReactNode }) {
  if (!showsCalendar) return children
  return <LiveCalendar>{children}</LiveCalendar>
}

function LiveCalendar({ children }: { children: ReactNode }) {
  const settings = useAppState().settings.calendar
  const dispatch = useDispatch()
  const toast = useToast()
  const copy = useCopy(COPY)
  const [source, setSource] = useState<CalendarSource | null>(null)
  const [status, setStatus] = useState<CalendarStatus | 'unknown'>('unknown')
  const [calendars, setCalendars] = useState<CalendarInfo[]>([])
  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [range, setRange] = useState<EventWindow>(() => eventWindow(todayIso()))
  const [revision, setRevision] = useState(0)
  const known = useRef<CalendarInfo[]>([])
  const active = status === 'granted' && settings.enabled
  const hiddenKey = settings.hidden.join('\n')

  useEffect(() => {
    let alive = true
    void calendarSource().then(async (found) => {
      if (!alive || !found) return
      setSource(found)
      const current = await found.status().catch((): CalendarStatus => 'denied')
      if (alive) setStatus(current)
    })
    return () => {
      alive = false
    }
  }, [])

  // Al volver a la app: quizá cambió el permiso o se añadió una cuenta en Ajustes.
  useEffect(() => {
    if (!source) return
    let timer: number | undefined
    const bump = () => {
      window.clearTimeout(timer)
      timer = window.setTimeout(() => setRevision((count) => count + 1), CHANGE_DEBOUNCE_MS)
    }
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return
      void source.status().then(setStatus, () => undefined)
      bump()
    }
    document.addEventListener('visibilitychange', onVisible)
    const stop = source.onChange(bump)
    return () => {
      window.clearTimeout(timer)
      document.removeEventListener('visibilitychange', onVisible)
      stop()
    }
  }, [source])

  // Los calendarios, también con el calendario apagado (Ajustes los enseña para elegir).
  useEffect(() => {
    if (!source || status !== 'granted') return
    let alive = true
    void source.calendars().then((found) => {
      if (!alive) return
      const added = addedCalendars(known.current, found)
      known.current = found
      setCalendars(found)
      const [first] = added
      if (first && settings.enabled) toast({ message: copy.added(first.source || first.title, added.length) })
    }, () => undefined)
    return () => {
      alive = false
    }
    // El aviso de calendarios nuevos no depende del idioma ni del ajuste: solo de volver a leerlos.
  }, [source, status, revision]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!source || !active) {
      // Si ya estaba vacío, el mismo array: nada se repinta.
      setEvents((current) => (current.length ? [] : current))
      return
    }
    let alive = true
    const from = fromIso(range.from).getTime()
    const to = fromIso(range.to).getTime()
    void source.events(from, to, settings.hidden).then(
      (found) => alive && setEvents((current) => (sameEvents(current, found) ? current : found)),
      () => undefined,
    )
    return () => {
      alive = false
    }
  }, [source, active, range, hiddenKey, revision]) // eslint-disable-line react-hooks/exhaustive-deps

  const watch = useCallback((day: IsoDate) => {
    setRange((current) => (windowCovers(current, day) ? current : eventWindow(day)))
  }, [])

  const connect = useCallback(async (): Promise<CalendarStatus> => {
    if (!source) return 'denied'
    const result = await source.request().catch((): CalendarStatus => 'denied')
    setStatus(result)
    if (result === 'granted') dispatch({ type: 'settings/calendar', enabled: true })
    return result
  }, [source, dispatch])

  const open = useCallback((event: CalendarEvent) => void source?.open(event).catch(() => undefined), [source])

  const value = useMemo<CalendarApi>(
    () => ({ available: true, status, active, calendars, events: active ? events : [], revision, watch, connect, open, source }),
    [status, active, calendars, events, revision, watch, connect, open, source],
  )

  return <CalendarContext.Provider value={value}>{children}</CalendarContext.Provider>
}

/** Lo mismo que ya había: así, volver a la app sin cambios en el calendario no repinta la Agenda. */
function sameEvents(a: readonly CalendarEvent[], b: readonly CalendarEvent[]): boolean {
  return (
    a.length === b.length &&
    a.every((event, index) => {
      const other = b[index]
      return (
        other !== undefined &&
        event.key === other.key &&
        event.end === other.end &&
        event.title === other.title &&
        event.color === other.color &&
        event.location === other.location &&
        event.allDay === other.allDay
      )
    })
  )
}

export const useCalendar = (): CalendarApi => useContext(CalendarContext)

const NO_EVENTS: DayEvents = { allDay: [], timed: [] }

/** Los eventos de un día (y que estén pedidos). Sin calendario, ninguno. */
export function useDayEvents(day: IsoDate): DayEvents {
  const { active, events, watch } = useCalendar()
  useEffect(() => {
    if (active) watch(day)
  }, [active, day, watch])
  return useMemo(() => (active && events.length ? eventsOfDay(events, day) : NO_EVENTS), [active, events, day])
}
