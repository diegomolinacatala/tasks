import { Activity, Suspense, lazy, useCallback, useDeferredValue, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { ComponentType, ReactNode } from 'react'
import { finishBoot } from './lib/boot'
import type { ComposeTarget } from './lib/compose'
import { composeTargets } from './lib/compose'
import { relativeLabel, shortTime } from './lib/date'
import { periodLabel } from './lib/period'
import { suggestEmoji } from './lib/emoji'
import { capitalize } from './lib/title'
import { createId } from './lib/id'
import { INBOX_EVENT } from './lib/inbox'
import { SAVE_FAILED_EVENT } from './lib/persistence'
import { draftsFromInterpreted } from './lib/interpret'
import type { ParsedTask } from './lib/parse'
import { parseSpoken, warmUpParser } from './lib/parse'
import { isNative } from './lib/platform'
import { haptic } from './lib/platform/feedback'
import type { RoutineDraft } from './lib/repeat'
import { parseRoutine } from './lib/repeat'
import { ALL_DAYS, MAX_ROUTINES, daysLabel, isoWeekday } from './lib/routines'
import { applyTheme } from './lib/theme'
import type { WelcomeRun } from './lib/welcome'
import { FULL_WELCOME, WELCOME_VERSION, availablePlates, welcomeOnLaunch } from './lib/welcome'
import { showsCalendar } from './lib/platform/calendar'
import { TodayContext, useRoutineDay, useToday } from './hooks/useToday'
import { useCopy, useLanguage } from './state/LanguageProvider'
import { useAppState, useDispatch, useFirstRun } from './state/StoreProvider'
import { isOverdue } from './state/selectors'
import type { TabId, Task, TaskDraft } from './types'
import { Composer } from './components/compose/Composer'
import { SizingContext } from './components/importance/sizing'
import { useAddTasks } from './components/compose/useAddTasks'
import { usePush } from './components/push/pushContext'
import { useNotificationActions } from './components/push/useNotificationActions'
import { TabBar } from './components/shell/TabBar'
import { useKeyboardInset } from './components/shell/useKeyboardInset'
import { useNativeActions } from './components/shell/useNativeActions'
import type { RowActions } from './components/task/rowActions'
import type { TaskOrigin } from './components/task/TaskSheet'
import { OPEN_TASK_EVENT, RowActionsContext } from './components/task/rowActions'
import { useTaskActions } from './components/task/useTaskActions'
import { IconTextSize } from './components/ui/Icons'
import { Skeleton } from './components/ui/Skeleton'
import { useToast } from './components/ui/Toast'
import { AgendaView } from './components/views/AgendaView'
import './components/shell/shell.css'

// Lo que no se ve al arrancar va en su propio trozo: la Bandeja y los paneles se piden en cuanto la
// agenda está pintada (abrirlos no espera a nada); Lugares y Ajustes, la primera vez que se abren.
const SIZING_HINT_KEY = 'tasks:sizing-hint'

const loadInbox = () => import('./components/views/InboxView')
const loadSheets = () =>
  Promise.all([loadInbox(), import('./components/task/TaskSheet'), import('./components/section/SectionSheet')])
const InboxView = lazy(() => loadInbox().then((module) => ({ default: module.InboxView })))
const TaskSheet = lazy(() => import('./components/task/TaskSheet').then((module) => ({ default: module.TaskSheet })))
const SectionSheet = lazy(() => import('./components/section/SectionSheet').then((module) => ({ default: module.SectionSheet })))
const RoutineSheet = lazy(() => import('./components/routines/RoutineSheet').then((module) => ({ default: module.RoutineSheet })))
const PlacesView = lazy(() => import('./components/places/PlacesView').then((module) => ({ default: module.PlacesView })))
const SettingsView = lazy(() => import('./components/settings/SettingsView').then((module) => ({ default: module.SettingsView })))
const FeedbackMode = lazy(() => import('./components/feedback/FeedbackMode').then((module) => ({ default: module.FeedbackMode })))
const PlaceTasksSheet = lazy(() =>
  import('./components/places/PlaceTasksSheet').then((module) => ({ default: module.PlaceTasksSheet })),
)
const NativeWidget = lazy(() => import('./components/widget/NativeWidget').then((module) => ({ default: module.NativeWidget })))
const NativeInbox = lazy(() => import('./components/shell/NativeInbox').then((module) => ({ default: module.NativeInbox })))
// Avisa de las versiones nuevas de la App Store (en local, con una de muestra si se pide).
const UpdatePrompt = lazy(() => import('./components/update/UpdatePrompt').then((module) => ({ default: module.UpdatePrompt })))
// Las tareas con hora al calendario del iPhone, si se ha elegido uno (en local, al de muestra).
// Solo hace algo con el permiso del calendario.
const CalendarExportSync = lazy(() =>
  import('./components/calendar/CalendarExportSync').then((module) => ({ default: module.CalendarExportSync })),
)
// La bienvenida sale la primera vez, tras una actualización que traiga láminas nuevas y desde Ajustes.
// Si su trozo no llegara a cargarse, la app se abre igual (y no se da por vista).
const Welcome = lazy<ComponentType<WelcomeHandlers>>(() =>
  import('./components/welcome/Welcome').then(
    (module) => ({ default: module.Welcome }),
    () => ({ default: WelcomeUnavailable }),
  ),
)

interface WelcomeHandlers {
  run: WelcomeRun
  onReady?: () => void
  onDone: () => void
  onUnavailable: () => void
}

function WelcomeUnavailable({ onReady, onUnavailable }: WelcomeHandlers) {
  useEffect(() => {
    onReady?.()
    onUnavailable()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  return null
}

const COPY = {
  es: {
    routineLimit: (max: number) => `Ya hay ${max} rutinas: borra alguna para añadir otra.`,
    routine: (name: string) => `Rutina: ${name}`,
    undo: 'Deshacer',
    view: 'Ver',
    inbox: 'Bandeja',
    noDate: 'Sin fecha',
    many: (count: number, titles: string) => `${count} tareas: ${titles}`,
    sizing: 'Tamaño según importancia',
    sizingHint: 'Arrastra el número de cada tarea a los lados: a la derecha, más grande.',
    noSection: 'sin sección',
    stopWriting: 'Dejar de escribir',
    schedule: 'Horario',
    scheduleFailed: 'No se han podido programar los avisos. Se reintenta solo.',
    saveFailed: 'No se está guardando. Libera espacio en el dispositivo o exporta una copia.',
    exportNow: 'Exportar',
  },
  en: {
    routineLimit: (max: number) => `You already have ${max} routines: delete one to add another.`,
    routine: (name: string) => `Routine: ${name}`,
    undo: 'Undo',
    view: 'View',
    inbox: 'Inbox',
    noDate: 'No date',
    many: (count: number, titles: string) => `${count} tasks: ${titles}`,
    sizing: 'Size by importance',
    sizingHint: 'Drag each task’s number sideways: right makes it bigger.',
    noSection: 'no section',
    stopWriting: 'Stop writing',
    schedule: 'Schedule',
    scheduleFailed: 'Reminders couldn’t be scheduled. It’ll retry on its own.',
    saveFailed: 'Changes aren’t being saved. Free up space on your device or export a backup.',
    exportNow: 'Export',
  },
} as const

/** El Worker: avisos, dictado y el buzón de sugerencias. Sin él (en local), no hay sugerencias. */
const API_URL = import.meta.env.VITE_PUSH_API

/** Lo que se espera tras el arranque para preparar el analizador (la entrada de la app dura menos). */
const WARM_UP_MS = 1200

/** Las pestañas donde se escribe y se ordena: llevan el compositor y el modo "Aa". */
const WRITING: ReadonlySet<TabId> = new Set(['inbox', 'agenda'])

/** Tocar el velo (o cualquier cosa que no sea la barra) suelta el teclado. */
const stopComposing = () => {
  if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
}

export function App() {
  const state = useAppState()
  const dispatch = useDispatch()
  const today = useToday()
  // Las rutinas cambian de día a la hora elegida (medianoche si no): lo tachado de madrugada es de ayer.
  const routineToday = useRoutineDay(state.settings.dayStart)
  const typing = useKeyboardInset()
  const toast = useToast()
  const addTasks = useAddTasks()
  const actions = useTaskActions()
  const push = usePush()
  const copy = useCopy(COPY)
  const language = useLanguage()
  // La PWA no puede avisar por lugar: allí esas frases se dejan tal cual.
  const places = isNative ? state.places : null

  const [tab, setTab] = useState<TabId>('agenda')
  // La barra de pestañas cambia al momento; la pestaña nueva se prepara sin bloquear el toque (en un
  // móvil modesto, montar una lista larga se nota) y aparece en cuanto está.
  const shownTab = useDeferredValue(tab)
  // Cada pestaña se monta la primera vez que se abre y después se conserva (con su scroll).
  const [visited, setVisited] = useState<ReadonlySet<TabId>>(() => new Set<TabId>(['agenda']))
  const [day, setDay] = useState(today)
  const [taskId, setTaskId] = useState<string | null>(null)
  const [fromNotification, setFromNotification] = useState(false)
  const [sectionId, setSectionId] = useState<string | null>(null)
  const [routineId, setRoutineId] = useState<string | null>(null)
  const [routineLoaded, setRoutineLoaded] = useState(false)
  const [placeId, setPlaceId] = useState<string | null>(null)
  const [focusRequest, setFocusRequest] = useState(0)
  // El + de una sección de la Agenda: la barra se abre con esa sección como destino.
  const [composeSection, setComposeSection] = useState<string | null>(null)
  const focusComposer = useRef<(() => void) | null>(null)
  // Modo "Aa": las filas enseñan su mando de importancia en lugar del asa de mover.
  const [sizing, setSizing] = useState(false)
  // La barra de escribir tiene el foco: las pestañas se apartan y la lista queda tras un velo.
  const [composing, setComposing] = useState(false)
  // Modo sugerencia (desde Ajustes): ir a cualquier sitio, rodearlo y escribir qué cambiarías.
  const [suggesting, setSuggesting] = useState(false)
  // La bienvenida: entera la primera vez, con lo nuevo tras actualizar, y a petición desde Ajustes.
  const firstRun = useFirstRun()
  const [welcome, setWelcome] = useState<WelcomeRun | null>(() =>
    welcomeOnLaunch(firstRun, state.settings.welcome, availablePlates(showsCalendar)),
  )
  // Tras el primer cambio de pestaña, las pestañas entran con su animación (en el arranque, no).
  const [switched, setSwitched] = useState(false)
  const scrollers = useRef<Partial<Record<TabId, HTMLDivElement | null>>>({})
  const scrollTops = useRef<Partial<Record<TabId, number>>>({})
  // La pestaña actual también en un ref: un "Ver" de un aviso antiguo no debe guardar el scroll de otra.
  const currentTab = useRef(tab)

  useEffect(() => applyTheme(state.settings.theme), [state.settings.theme])

  useEffect(() => {
    // Ya hay estado pintado: se funde el arranque (#boot) y la app entra. Con bienvenida lo funde
    // ella cuando está pintada (`onReady`): así no llega a verse la app vacía por debajo.
    if (!welcome) finishBoot()
    if (isNative) void import('./lib/platform/shell').then(({ showApp }) => showApp())
    void loadSheets()
    // Con la app ya entrada, en un rato libre: la primera tecla en la barra no espera a compilar nada.
    const warm = window.setTimeout(() => warmUpParser(Date.now()), WARM_UP_MS)
    return () => window.clearTimeout(warm)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Si los avisos no se pueden programar, se dice una vez (no en cada reintento); Ajustes lo repite.
  const scheduleFailed = useRef(false)
  useEffect(() => {
    if (push.syncFailed && !scheduleFailed.current) toast({ message: copy.scheduleFailed, tone: 'error' })
    scheduleFailed.current = push.syncFailed
  }, [push.syncFailed]) // eslint-disable-line react-hooks/exhaustive-deps

  // Pasada la medianoche con la app abierta, si se miraba "hoy", se sigue mirando hoy.
  const previousToday = useRef(today)
  useEffect(() => {
    const previous = previousToday.current
    if (previous === today) return
    previousToday.current = today
    setDay((current) => (current === previous ? today : current))
  }, [today])

  // Al volver a una pestaña, su scroll donde estaba: oculta pierde la posición. Si estaba arriba no
  // se toca: escribir `scrollTop` obliga a calcular el diseño de golpe, y en un móvil modesto se nota.
  useLayoutEffect(() => {
    const node = scrollers.current[shownTab]
    const top = scrollTops.current[shownTab] ?? 0
    if (node && top > 0) node.scrollTop = top
  }, [shownTab])

  const go = useCallback((next: TabId) => {
    const leaving = currentTab.current
    if (leaving === next) return
    scrollTops.current[leaving] = scrollers.current[leaving]?.scrollTop ?? 0
    currentTab.current = next
    setVisited((current) => (current.has(next) ? current : new Set([...current, next])))
    setTab(next)
    setSwitched(true)
    haptic('selection')
    if (!WRITING.has(next)) setSizing(false)
  }, [])

  // Si el estado deja de guardarse, lo hecho desde entonces se perdería al cerrar: hay que decirlo.
  useEffect(() => {
    const onFail = () => toast({ message: copy.saveFailed, actionLabel: copy.exportNow, tone: 'error', onAction: () => go('settings') })
    window.addEventListener(SAVE_FAILED_EVENT, onFail)
    return () => window.removeEventListener(SAVE_FAILED_EVENT, onFail)
  }, [toast, copy, go])

  // Cerrada (acabada o saltada): esta versión queda vista y no vuelve a salir sola.
  const closeWelcome = useCallback(() => {
    setWelcome(null)
    dispatch({ type: 'settings/welcome', version: WELCOME_VERSION })
  }, [dispatch])

  const [agendaReset, setAgendaReset] = useState(0)
  const reselect = (current: TabId) => {
    scrollers.current[current]?.scrollTo({ top: 0, behavior: 'smooth' })
    if (current === 'agenda') {
      setDay(today)
      setAgendaReset((count) => count + 1)
    }
  }

  /** Lleva la vista a una fila recién añadida (ya pintada) y la deja a la vista. */
  const revealTask = (id: string) => {
    let tries = 0
    const look = () => {
      const node = document.querySelector(`[data-flip="${CSS.escape(id)}"]`)
      if (node) return node.scrollIntoView({ block: 'center', behavior: 'smooth' })
      if ((tries += 1) < 20) requestAnimationFrame(look)
    }
    requestAnimationFrame(look)
  }

  const openTask = useCallback((id: string | null) => {
    setFromNotification(false)
    setTaskId(id)
  }, [])

  // El panel de un lugar (por encima de App) abre una tarea con un aviso del DOM.
  useEffect(() => {
    const onOpen = (event: Event) => {
      const id = (event as CustomEvent<unknown>).detail
      if (typeof id === 'string') openTask(id)
    }
    window.addEventListener(OPEN_TASK_EVENT, onOpen)
    return () => window.removeEventListener(OPEN_TASK_EVENT, onOpen)
  }, [openTask])

  const openRoutine = useCallback((id: string) => {
    setRoutineLoaded(true)
    setRoutineId(id)
  }, [])

  const rowActions = useMemo<RowActions>(
    () => ({
      toggle: actions.toggle,
      remove: actions.remove,
      open: openTask,
      setImportance: actions.setImportance,
      toggleRoutine: actions.toggleRoutine,
      removeRoutine: actions.removeRoutine,
      openRoutine,
    }),
    [actions, openTask, openRoutine],
  )

  useNotificationActions({
    onOpenTask: (id) => {
      setFromNotification(true)
      setTaskId(id)
    },
    onOpenPlace: setPlaceId,
    onOpenRoutine: () => go('inbox'),
  })

  /** Al llegar al tope, se dice en vez de fingir que se ha creado. */
  const roomForRoutine = () => {
    if (state.routines.length < MAX_ROUTINES) return true
    toast({ message: copy.routineLimit(MAX_ROUTINES) })
    return false
  }

  /** `false` si no cabe (ya lo ha dicho un aviso): la barra conserva lo escrito. */
  const addRoutine = (draft: RoutineDraft): boolean => {
    if (!roomForRoutine()) return false
    const id = createId()
    const emoji = suggestEmoji(draft.title)
    dispatch({ type: 'routine/add', id, title: draft.title, days: draft.days, time: draft.time, emoji })
    haptic('success')
    // Siempre Deshacer: si se leyó mal ("los lunes" por "el lunes"), la vuelta atrás está aquí mismo.
    toast({
      message: copy.routine(`${emoji ? `${emoji} ` : ''}${draft.title} · ${draft.label}`),
      actionLabel: copy.undo,
      onAction: () => dispatch({ type: 'routine/remove', id }),
    })
    return true
  }

  /**
   * Del panel de una tarea: pasa a ser una rutina (con su hora) y se abre para ajustarla. Una tarea de un
   * martes se repite los martes; sin día, cada día.
   */
  const makeRoutine = (task: Task) => {
    if (!roomForRoutine()) return
    const id = createId()
    const days = task.date ? [isoWeekday(task.date)] : [...ALL_DAYS]
    dispatch({ type: 'routine/add', id, title: task.title, days, time: task.time, emoji: suggestEmoji(task.title) })
    dispatch({ type: 'task/remove', id: task.id })
    haptic('success')
    openTask(null)
    openRoutine(id)
    toast({
      message: `${copy.routine(task.title)} · ${daysLabel(days).toLowerCase()}`,
      actionLabel: copy.undo,
      onAction: () => {
        // El panel abierto es el de la rutina que se va: se cierra y vuelve el de la tarea.
        setRoutineId(null)
        dispatch({ type: 'routine/remove', id })
        dispatch({ type: 'task/restore', task })
        openTask(task.id)
      },
    })
  }

  /**
   * Si la tarea cae fuera de lo que se está viendo, se dice adónde ha ido y se ofrece ir (cerrando
   * la barra y llevando la vista a la fila). Si cae en una sección plegada, se despliega. Si entra por
   * el + de una sección pero lleva hora, va al Horario: se dice.
   */
  const addTask = (draft: TaskDraft) => {
    const section = draft.sectionId ? state.sections.find((item) => item.id === draft.sectionId) : undefined
    if (section?.collapsed) dispatch({ type: 'section/toggle', id: section.id })
    const added = addTasks([draft])
    const [id] = added.tasks
    const here = tab === 'agenda' ? draft.date === day : draft.date === null
    if (here) {
      if (section && draft.time) toast({ message: `${draft.title} → ${copy.schedule} · ${shortTime(draft.time)}` })
      return
    }
    const { date } = draft
    toast({
      message: `${draft.title} → ${date ? (draft.until ? periodLabel(date, draft.until, today) : capitalize(relativeLabel(date, today))) : copy.inbox}`,
      actionLabel: copy.view,
      onAction: () => {
        stopComposing()
        if (date) setDay(date)
        go(date ? 'agenda' : 'inbox')
        if (id) revealTask(id)
      },
    })
  }

  /**
   * Al cerrar el panel de una tarea que cambió de día o de sección: si ya no está en lo que se ve (otro
   * día, la Bandeja), se dice adónde ha ido y se ofrece ir; si al quitarle el día perdió la sección, también.
   */
  const relocated = (task: Task, from: TaskOrigin) => {
    const here = tab === 'agenda' ? task.date === day : tab === 'inbox' ? task.date === null : true
    const lostSection = task.date === null && from.sectionId !== null
    if (here && !lostSection) return
    const where = task.date ? (task.until ? periodLabel(task.date, task.until, today) : capitalize(relativeLabel(task.date, today))) : copy.inbox
    const message = `${task.title} → ${where}${lostSection ? ` · ${copy.noSection}` : ''}`
    if (here) {
      toast({ message })
      return
    }
    toast({
      message,
      actionLabel: copy.view,
      onAction: () => {
        if (task.date) setDay(task.date)
        go(task.date ? 'agenda' : 'inbox')
        revealTask(task.id)
      },
    })
  }

  /** El modo "Aa" se explica solo la primera vez: nadie deduce del icono que el número se arrastra. */
  const toggleSizing = () => {
    setSizing((on) => !on)
    if (sizing) return
    try {
      if (localStorage.getItem(SIZING_HINT_KEY)) return
      localStorage.setItem(SIZING_HINT_KEY, '1')
    } catch {
      return
    }
    toast({ message: copy.sizingHint })
  }

  /**
   * Lo dictado o pedido a Siri se crea sin pasos intermedios; el toast dice qué se ha entendido y
   * adónde ha ido. Deshacer quita también los lugares que nacieron con ello, si nadie más los usa.
   */
  const addSpoken = (drafts: ParsedTask[]) => {
    if (!drafts.length) return
    const added = addTasks(drafts)
    const [first] = drafts
    const where = first?.date ? '' : ` · ${copy.inbox}`
    toast({
      message:
        drafts.length === 1 && first
          ? `${first.title} · ${first.label || copy.noDate}${first.label ? '' : where}`
          : copy.many(drafts.length, drafts.map((draft) => draft.title).join(', ')),
      actionLabel: copy.undo,
      onAction: () => {
        added.tasks.forEach((id) => dispatch({ type: 'task/remove', id }))
        added.places.forEach((id) => dispatch({ type: 'place/remove', id }))
      },
    })
  }

  // "Todos los días…" es una rutina; si no, lo que entendió la IA del servidor manda y, si no hay
  // nada válido, el analizador local. La IA solo entiende español: en inglés, siempre el local.
  // Lo que no dice día cae donde dice la barra (`target`), igual que lo tecleado.
  const addFromVoice = (text: string, interpreted: unknown, target?: ComposeTarget) => {
    const now = Date.now()
    const routine = parseRoutine(text, now)
    // Si la rutina no cabe (ya hay 50), lo dicho no se pierde: queda como tarea.
    if (routine && addRoutine(routine)) return
    const understood = language === 'es' ? draftsFromInterpreted(interpreted, now, places, text) : null
    const drafts = understood ?? [parseSpoken(text, now, places)].filter((draft) => draft.title)
    const placed = drafts.map((draft) =>
      draft.date === null && !draft.until && target?.date
        ? { ...draft, date: target.date, ...(target.sectionId ? { sectionId: target.sectionId } : {}) }
        : draft,
    )
    addSpoken(placed)
  }

  useNativeActions({
    onAdd: (text) => addSpoken([parseSpoken(text, Date.now(), places)].filter((draft) => draft.title)),
    onCompose: (inbox) => {
      if (inbox) go('inbox')
      else if (!WRITING.has(tab)) go('agenda')
      setFocusRequest((count) => count + 1)
    },
    onWeek: () => go('agenda'),
    onToday: () => {
      setDay(today)
      go('agenda')
    },
    onOpenTask: openTask,
    onInbox: () => window.dispatchEvent(new Event(INBOX_EVENT)),
    onRoutines: () => go('inbox'),
    onBacklog: () => go('inbox'),
  })

  const hasOverdue = useMemo(() => state.tasks.some((task) => isOverdue(task, today)), [state.tasks, today])
  // Lo de la barra de escribir va con la pestaña que se ve, no con la que se acaba de tocar.
  const writing = WRITING.has(shownTab)
  const inAgenda = shownTab === 'agenda'
  // Adónde puede ir lo escrito: primero donde se está mirando, después los sitios de siempre.
  const section = inAgenda && composeSection ? state.sections.find((item) => item.id === composeSection) : undefined
  const targets = useMemo(
    () => composeTargets(inAgenda ? day : null, today, section ? { id: section.id, name: section.name } : null),
    [inAgenda, day, today, section, language],
  )

  /** El + de una sección: la barra se abre ahí mismo (en el mismo toque, para que salga el teclado). */
  const addToSection = useCallback((id: string) => {
    setComposeSection(id)
    focusComposer.current?.()
  }, [])

  const onComposing = useCallback((active: boolean) => setComposing(active), [])
  // La sección deja de ser el destino cuando la barra se vacía (o se cambia de día o de pestaña), no
  // al soltar el teclado: mientras haya algo escrito, lo elegido sigue valiendo.
  const onComposerReset = useCallback(() => setComposeSection(null), [])
  useEffect(() => setComposeSection(null), [day, tab])

  // Lo que flota al pie publica su alto real: el final de la lista y el toast se colocan encima de
  // la barra de escribir (que crece con las píldoras) y de las pestañas (que se van al escribir).
  const dock = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    const root = document.documentElement.style
    const node = dock.current
    if (!node) {
      root.setProperty('--dock-h', '0px')
      return
    }
    const observer = new ResizeObserver(() => root.setProperty('--dock-h', `${node.offsetHeight}px`))
    observer.observe(node)
    return () => {
      observer.disconnect()
      root.setProperty('--dock-h', '0px')
    }
  }, [writing])
  useEffect(() => {
    document.documentElement.style.setProperty('--tabs-h', typing || (writing && composing) ? '0px' : 'var(--nav-h)')
  }, [typing, writing, composing])

  const pane = (id: TabId, content: ReactNode) =>
    visited.has(id) && (
      <Activity mode={shownTab === id ? 'visible' : 'hidden'}>
        <div
          className="app__scroll"
          ref={(node) => {
            scrollers.current[id] = node
          }}
        >
          <Suspense fallback={<Skeleton />}>{content}</Suspense>
        </div>
      </Activity>
    )

  return (
    <TodayContext.Provider value={today}>
    <RowActionsContext.Provider value={rowActions}>
      <div
        inert={welcome !== null}
        data-welcome={welcome !== null ? '' : undefined}
        className={`app ${typing ? 'is-typing' : ''} ${sizing ? 'is-sizing' : ''} ${switched ? 'has-switched' : ''} ${
          writing ? 'has-composer' : ''
        } ${writing && composing ? 'is-composing' : ''}`}
      >
        {writing && (
          <button
            type="button"
            className="app__sizing"
            aria-label={copy.sizing}
            aria-pressed={sizing}
            onClick={toggleSizing}
          >
            <IconTextSize size={21} />
          </button>
        )}

        <main className="app__views">
          <SizingContext.Provider value={sizing}>
            {pane('inbox', <InboxView today={today} routineDay={routineToday} />)}
            {pane(
              'agenda',
              <AgendaView
                day={day}
                today={today}
                routineDay={routineToday}
                resetSignal={agendaReset}
                onSelectDay={setDay}
                onOpenSection={setSectionId}
                onAddToSection={addToSection}
              />,
            )}
            {pane('places', <PlacesView />)}
            {pane(
              'settings',
              <SettingsView onWelcome={() => setWelcome(FULL_WELCOME)} onSuggest={API_URL ? () => setSuggesting(true) : undefined} />,
            )}
          </SizingContext.Provider>
          {/* Mientras se escribe, la lista se aparta tras un velo de papel; tocarlo suelta la barra. */}
          <button type="button" className="app__veil" tabIndex={-1} aria-label={copy.stopWriting} aria-hidden={!composing} onClick={stopComposing} />
        </main>

        <div className="app__bar">
          {writing && (
            <div className="app__dock" ref={dock}>
              <Composer
                targets={targets}
                today={today}
                places={places}
                focusRequest={focusRequest}
                focusRef={focusComposer}
                onSubmit={addTask}
                onRoutine={addRoutine}
                onVoice={addFromVoice}
                onComposing={onComposing}
                onReset={onComposerReset}
                onPlacesHint={() => go('places')}
              />
            </div>
          )}
          <TabBar tab={tab} overdue={hasOverdue} onChange={go} onReselect={reselect} />
        </div>

        <Suspense fallback={null}>
          <TaskSheet
            taskId={taskId}
            fromNotification={fromNotification}
            onClose={() => openTask(null)}
            onMakeRoutine={makeRoutine}
            onRelocated={relocated}
          />
          <SectionSheet sectionId={sectionId} onClose={() => setSectionId(null)} />
          {routineLoaded && <RoutineSheet routineId={routineId} today={routineToday} onClose={() => setRoutineId(null)} />}
        </Suspense>
        {(isNative || import.meta.env.DEV) && (
          <Suspense fallback={null}>
            <UpdatePrompt paused={welcome !== null || suggesting} />
          </Suspense>
        )}
        {/* También con el ajuste quitado: así borra lo que había añadido. */}
        {showsCalendar && (
          <Suspense fallback={null}>
            <CalendarExportSync />
          </Suspense>
        )}
        {isNative && (
          <Suspense fallback={null}>
            <PlaceTasksSheet placeId={placeId} onOpenTask={openTask} onClose={() => setPlaceId(null)} />
            <NativeWidget today={today} />
            <NativeInbox />
          </Suspense>
        )}
      </div>
      {suggesting && API_URL && (
        <Suspense fallback={null}>
          <FeedbackMode tab={tab} api={API_URL} onDone={() => setSuggesting(false)} />
        </Suspense>
      )}
      {welcome && (
        <Suspense fallback={null}>
          <Welcome run={welcome} onReady={finishBoot} onDone={closeWelcome} onUnavailable={() => setWelcome(null)} />
        </Suspense>
      )}
    </RowActionsContext.Provider>
    </TodayContext.Provider>
  )
}
