import { Activity, Suspense, lazy, useCallback, useDeferredValue, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { ComponentType, ReactNode } from 'react'
import { finishBoot } from './lib/boot'
import { addLabel, composeTargets } from './lib/compose'
import { relativeLabel } from './lib/date'
import { periodLabel } from './lib/period'
import { suggestEmoji } from './lib/emoji'
import { createId } from './lib/id'
import { INBOX_EVENT } from './lib/inbox'
import { draftsFromInterpreted } from './lib/interpret'
import type { ParsedTask } from './lib/parse'
import { parseSpoken, warmUpParser } from './lib/parse'
import { isNative } from './lib/platform'
import { haptic } from './lib/platform/feedback'
import type { RoutineDraft } from './lib/repeat'
import { parseRoutine } from './lib/repeat'
import { ALL_DAYS, MAX_ROUTINES } from './lib/routines'
import { applyTheme } from './lib/theme'
import type { WelcomeRun } from './lib/welcome'
import { FULL_WELCOME, WELCOME_VERSION, welcomeOnLaunch } from './lib/welcome'
import { useRoutineDay, useToday } from './hooks/useToday'
import { useCopy, useLanguage } from './state/LanguageProvider'
import { useAppState, useDispatch, useFirstRun } from './state/StoreProvider'
import { isOverdue } from './state/selectors'
import type { TabId, Task, TaskDraft } from './types'
import { Composer } from './components/compose/Composer'
import { SizingContext } from './components/importance/sizing'
import { useAddTasks } from './components/compose/useAddTasks'
import { useNotificationActions } from './components/push/useNotificationActions'
import { TabBar } from './components/shell/TabBar'
import { useKeyboardInset } from './components/shell/useKeyboardInset'
import { useNativeActions } from './components/shell/useNativeActions'
import type { RowActions } from './components/task/rowActions'
import { RowActionsContext } from './components/task/rowActions'
import { useTaskActions } from './components/task/useTaskActions'
import { IconTextSize } from './components/ui/Icons'
import { Skeleton } from './components/ui/Skeleton'
import { useToast } from './components/ui/Toast'
import { AgendaView } from './components/views/AgendaView'
import './components/shell/shell.css'

// Lo que no se ve al arrancar va en su propio trozo: la Bandeja y los paneles se piden en cuanto la
// agenda está pintada (abrirlos no espera a nada); Lugares y Ajustes, la primera vez que se abren.
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
    stopWriting: 'Dejar de escribir',
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
    stopWriting: 'Stop writing',
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
  // Modo "Aa": las filas enseñan su mando de importancia en lugar del asa de mover.
  const [sizing, setSizing] = useState(false)
  // La barra de escribir tiene el foco: las pestañas se apartan y la lista queda tras un velo.
  const [composing, setComposing] = useState(false)
  // Modo sugerencia (desde Ajustes): ir a cualquier sitio, rodearlo y escribir qué cambiarías.
  const [suggesting, setSuggesting] = useState(false)
  // La bienvenida: entera la primera vez, con lo nuevo tras actualizar, y a petición desde Ajustes.
  const firstRun = useFirstRun()
  const [welcome, setWelcome] = useState<WelcomeRun | null>(() => welcomeOnLaunch(firstRun, state.settings.welcome))
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
    if (!WRITING.has(next)) setSizing(false)
  }, [])

  // Cerrada (acabada o saltada): esta versión queda vista y no vuelve a salir sola.
  const closeWelcome = useCallback(() => {
    setWelcome(null)
    dispatch({ type: 'settings/welcome', version: WELCOME_VERSION })
  }, [dispatch])

  const reselect = (current: TabId) => {
    scrollers.current[current]?.scrollTo({ top: 0, behavior: 'smooth' })
    if (current === 'agenda') setDay(today)
  }

  const openTask = useCallback((id: string | null) => {
    setFromNotification(false)
    setTaskId(id)
  }, [])

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
    toast({
      message: copy.routine(`${emoji ? `${emoji} ` : ''}${draft.title} · ${draft.label}`),
      actionLabel: tab === 'inbox' ? copy.undo : copy.view,
      onAction: () => (tab === 'inbox' ? dispatch({ type: 'routine/remove', id }) : go('inbox')),
    })
    return true
  }

  /** Del panel de una tarea: pasa a ser una rutina de cada día (con su hora) y se abre para ajustarla. */
  const makeRoutine = (task: Task) => {
    if (!roomForRoutine()) return
    const id = createId()
    dispatch({ type: 'routine/add', id, title: task.title, days: [...ALL_DAYS], time: task.time, emoji: suggestEmoji(task.title) })
    dispatch({ type: 'task/remove', id: task.id })
    haptic('success')
    openTask(null)
    openRoutine(id)
    toast({
      message: copy.routine(task.title),
      actionLabel: copy.undo,
      onAction: () => {
        dispatch({ type: 'routine/remove', id })
        dispatch({ type: 'task/restore', task })
      },
    })
  }

  /** Si la tarea cae fuera de lo que se está viendo, se dice adónde ha ido y se ofrece ir. */
  const addTask = (draft: TaskDraft) => {
    addTasks([draft])
    const here = tab === 'agenda' ? draft.date === day : draft.date === null
    if (here) return
    const { date } = draft
    toast({
      message: `${draft.title} → ${date ? (draft.until ? periodLabel(date, draft.until, today) : relativeLabel(date, today)) : copy.inbox}`,
      actionLabel: copy.view,
      onAction: () => {
        if (date) setDay(date)
        go(date ? 'agenda' : 'inbox')
      },
    })
  }

  /** Lo dictado o pedido a Siri se crea sin pasos intermedios; el toast confirma qué se ha entendido. */
  const addSpoken = (drafts: ParsedTask[]) => {
    if (!drafts.length) return
    const ids = addTasks(drafts)
    const [first] = drafts
    toast({
      message:
        drafts.length === 1 && first
          ? `${first.title} · ${first.label || copy.noDate}`
          : copy.many(drafts.length, drafts.map((draft) => draft.title).join(', ')),
      actionLabel: copy.undo,
      onAction: () => ids.forEach((id) => dispatch({ type: 'task/remove', id })),
    })
  }

  // "Todos los días…" es una rutina; si no, lo que entendió la IA del servidor manda y, si no hay
  // nada válido, el analizador local. La IA solo entiende español: en inglés, siempre el local.
  const addFromVoice = (text: string, interpreted: unknown) => {
    const now = Date.now()
    const routine = parseRoutine(text, now)
    if (routine) {
      addRoutine(routine)
      return
    }
    const understood = language === 'es' ? draftsFromInterpreted(interpreted, now, places, text) : null
    addSpoken(understood ?? [parseSpoken(text, now, places)].filter((draft) => draft.title))
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
  const targets = useMemo(() => composeTargets(inAgenda ? day : null, today), [inAgenda, day, today, language])

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
    <RowActionsContext.Provider value={rowActions}>
      <div
        inert={welcome !== null}
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
            onClick={() => setSizing((on) => !on)}
          >
            <IconTextSize size={21} />
          </button>
        )}

        <main className="app__views">
          <SizingContext.Provider value={sizing}>
            {pane('inbox', <InboxView today={today} routineDay={routineToday} />)}
            {pane('agenda', <AgendaView day={day} today={today} onSelectDay={setDay} onOpenSection={setSectionId} />)}
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
            <div className="app__dock">
              <Composer
                targets={targets}
                placeholder={addLabel(inAgenda ? day : null, today)}
                today={today}
                places={places}
                focusRequest={focusRequest}
                onSubmit={addTask}
                onRoutine={addRoutine}
                onVoice={addFromVoice}
                onComposing={setComposing}
              />
            </div>
          )}
          <TabBar tab={tab} overdue={hasOverdue} onChange={go} onReselect={reselect} />
        </div>

        <Suspense fallback={null}>
          <TaskSheet taskId={taskId} fromNotification={fromNotification} onClose={() => openTask(null)} onMakeRoutine={makeRoutine} />
          <SectionSheet sectionId={sectionId} onClose={() => setSectionId(null)} />
          {routineLoaded && <RoutineSheet routineId={routineId} today={routineToday} onClose={() => setRoutineId(null)} />}
        </Suspense>
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
  )
}
