import { Activity, Suspense, lazy, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { finishBoot } from './lib/boot'
import { dayNameLong, dayNumber, relativeLabel } from './lib/date'
import { createId } from './lib/id'
import { INBOX_EVENT } from './lib/inbox'
import { draftsFromInterpreted } from './lib/interpret'
import type { ParsedTask } from './lib/parse'
import { parseSpoken } from './lib/parse'
import { isNative } from './lib/platform'
import { haptic } from './lib/platform/feedback'
import type { RoutineDraft } from './lib/repeat'
import { parseRoutine } from './lib/repeat'
import { ALL_DAYS, MAX_ROUTINES } from './lib/routines'
import { applyTheme } from './lib/theme'
import { useToday } from './hooks/useToday'
import { useAppState, useDispatch } from './state/StoreProvider'
import { isOverdue } from './state/selectors'
import type { TabId, Task, TaskDraft } from './types'
import type { QuickTarget } from './components/compose/Composer'
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
const PlaceTasksSheet = lazy(() =>
  import('./components/places/PlaceTasksSheet').then((module) => ({ default: module.PlaceTasksSheet })),
)
const NativeWidget = lazy(() => import('./components/widget/NativeWidget').then((module) => ({ default: module.NativeWidget })))
const NativeInbox = lazy(() => import('./components/shell/NativeInbox').then((module) => ({ default: module.NativeInbox })))

/** Las pestañas donde se escribe y se ordena: llevan el compositor y el modo "Aa". */
const WRITING: ReadonlySet<TabId> = new Set(['inbox', 'agenda'])

export function App() {
  const state = useAppState()
  const dispatch = useDispatch()
  const today = useToday()
  const typing = useKeyboardInset()
  const toast = useToast()
  const addTasks = useAddTasks()
  const actions = useTaskActions()
  // La PWA no puede avisar por lugar: allí esas frases se dejan tal cual.
  const places = isNative ? state.places : null

  const [tab, setTab] = useState<TabId>('agenda')
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
  // Tras el primer cambio de pestaña, las pestañas entran con su animación (en el arranque, no).
  const [switched, setSwitched] = useState(false)
  const scrollers = useRef<Partial<Record<TabId, HTMLDivElement | null>>>({})
  const scrollTops = useRef<Partial<Record<TabId, number>>>({})
  // La pestaña actual también en un ref: un "Ver" de un aviso antiguo no debe guardar el scroll de otra.
  const currentTab = useRef(tab)

  useEffect(() => applyTheme(state.settings.theme), [state.settings.theme])

  useEffect(() => {
    // Ya hay estado pintado: se funde el arranque (#boot) y la app entra.
    finishBoot()
    if (isNative) void import('./lib/platform/shell').then(({ showApp }) => showApp())
    void loadSheets()
  }, [])

  // Pasada la medianoche con la app abierta, si se miraba "hoy", se sigue mirando hoy.
  const previousToday = useRef(today)
  useEffect(() => {
    const previous = previousToday.current
    if (previous === today) return
    previousToday.current = today
    setDay((current) => (current === previous ? today : current))
  }, [today])

  // Al volver a una pestaña, su scroll donde estaba: oculta pierde la posición.
  useLayoutEffect(() => {
    const node = scrollers.current[tab]
    if (node) node.scrollTop = scrollTops.current[tab] ?? 0
  }, [tab])

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
    toast({ message: `Ya hay ${MAX_ROUTINES} rutinas: borra alguna para añadir otra.` })
    return false
  }

  const addRoutine = (draft: RoutineDraft) => {
    if (!roomForRoutine()) return
    const id = createId()
    dispatch({ type: 'routine/add', id, title: draft.title, days: draft.days, time: draft.time })
    haptic('success')
    toast({
      message: `Rutina: ${draft.title} · ${draft.label}`,
      actionLabel: tab === 'inbox' ? 'Deshacer' : 'Ver',
      onAction: () => (tab === 'inbox' ? dispatch({ type: 'routine/remove', id }) : go('inbox')),
    })
  }

  /** Del panel de una tarea: pasa a ser una rutina de cada día (con su hora) y se abre para ajustarla. */
  const makeRoutine = (task: Task) => {
    if (!roomForRoutine()) return
    const id = createId()
    dispatch({ type: 'routine/add', id, title: task.title, days: [...ALL_DAYS], time: task.time })
    dispatch({ type: 'task/remove', id: task.id })
    haptic('success')
    openTask(null)
    openRoutine(id)
    toast({
      message: `Rutina: ${task.title}`,
      actionLabel: 'Deshacer',
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
      message: `${draft.title} → ${date ? relativeLabel(date, today) : 'Bandeja'}`,
      actionLabel: 'Ver',
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
          ? `${first.title} · ${first.label || 'Sin fecha'}`
          : `${drafts.length} tareas: ${drafts.map((draft) => draft.title).join(', ')}`,
      actionLabel: 'Deshacer',
      onAction: () => ids.forEach((id) => dispatch({ type: 'task/remove', id })),
    })
  }

  // "Todos los días…" es una rutina; si no, lo que entendió la IA del servidor manda y, si no hay
  // nada válido, el analizador local.
  const addFromVoice = (text: string, interpreted: unknown) => {
    const now = Date.now()
    const routine = parseRoutine(text, now)
    if (routine) return addRoutine(routine)
    addSpoken(draftsFromInterpreted(interpreted, now, places) ?? [parseSpoken(text, now, places)].filter((draft) => draft.title))
  }

  useNativeActions({
    onAdd: (text) => addSpoken([parseSpoken(text, Date.now(), places)].filter((draft) => draft.title)),
    onCompose: () => {
      if (!WRITING.has(tab)) go('agenda')
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
  })

  const hasOverdue = useMemo(() => state.tasks.some((task) => isOverdue(task, today)), [state.tasks, today])
  const writing = WRITING.has(tab)
  const inAgenda = tab === 'agenda'
  const near = relativeLabel(day, today)
  const target = day === today ? 'a hoy' : near === 'Mañana' ? 'a mañana' : `al ${dayNameLong(day)} ${dayNumber(day)}`
  const quick: QuickTarget = inAgenda ? { label: 'Sin fecha', date: null } : { label: 'Hoy', date: today }

  const pane = (id: TabId, content: ReactNode) =>
    visited.has(id) && (
      <Activity mode={tab === id ? 'visible' : 'hidden'}>
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
      <div className={`app ${typing ? 'is-typing' : ''} ${sizing ? 'is-sizing' : ''} ${switched ? 'has-switched' : ''}`}>
        {writing && (
          <button
            type="button"
            className="app__sizing"
            aria-label="Tamaño según importancia"
            aria-pressed={sizing}
            onClick={() => setSizing((on) => !on)}
          >
            <IconTextSize size={21} />
          </button>
        )}

        <main className="app__views">
          <SizingContext.Provider value={sizing}>
            {pane('inbox', <InboxView today={today} />)}
            {pane('agenda', <AgendaView day={day} today={today} onSelectDay={setDay} onOpenSection={setSectionId} />)}
            {pane('places', <PlacesView />)}
            {pane('settings', <SettingsView />)}
          </SizingContext.Provider>
        </main>

        <div className="app__bar">
          {writing && (
            <Composer
              defaultDate={inAgenda ? day : null}
              placeholder={inAgenda ? `Añadir ${target}` : 'Añadir a la bandeja'}
              quick={quick}
              places={places}
              focusRequest={focusRequest}
              onSubmit={addTask}
              onRoutine={addRoutine}
              onVoice={addFromVoice}
            />
          )}
          <TabBar tab={tab} overdue={hasOverdue} onChange={go} onReselect={reselect} />
        </div>

        <Suspense fallback={null}>
          <TaskSheet taskId={taskId} fromNotification={fromNotification} onClose={() => openTask(null)} onMakeRoutine={makeRoutine} />
          <SectionSheet sectionId={sectionId} onClose={() => setSectionId(null)} />
          {routineLoaded && <RoutineSheet routineId={routineId} today={today} onClose={() => setRoutineId(null)} />}
        </Suspense>
        {isNative && (
          <Suspense fallback={null}>
            <PlaceTasksSheet placeId={placeId} onOpenTask={openTask} onClose={() => setPlaceId(null)} />
            <NativeWidget today={today} />
            <NativeInbox />
          </Suspense>
        )}
      </div>
    </RowActionsContext.Provider>
  )
}
