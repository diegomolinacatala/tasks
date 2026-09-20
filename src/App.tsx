import { Suspense, lazy, useEffect, useRef, useState } from 'react'
import { dayNameShort, dayNumber, weekDays } from './lib/date'
import { withTransition } from './lib/transition'
import { useToday } from './hooks/useToday'
import { INBOX_EVENT } from './lib/inbox'
import { draftsFromInterpreted } from './lib/interpret'
import type { ParsedTask } from './lib/parse'
import { parseSpoken } from './lib/parse'
import { isNative } from './lib/platform'
import { useAppState, useDispatch } from './state/StoreProvider'
import type { IsoDate, ViewId } from './types'
import { Composer } from './components/compose/Composer'
import { SizingContext } from './components/importance/sizing'
import { useAddTasks } from './components/compose/useAddTasks'
import { useNotificationActions } from './components/push/useNotificationActions'
import { BottomNav } from './components/shell/BottomNav'
import { useKeyboardInset } from './components/shell/useKeyboardInset'
import { useNativeActions } from './components/shell/useNativeActions'
import { IconMore, IconTextSize } from './components/ui/Icons'
import { useToast } from './components/ui/Toast'
import { HomeView } from './components/views/HomeView'
import './components/shell/shell.css'

const loadWeekView = () => import('./components/views/WeekView')

// Los paneles de tarea y sección, y la vista semana, van en su propio trozo: se piden en cuanto la
// lista está pintada, no al tocar, así que abrirlos no espera a nada y la PWA arranca más ligera.
const WeekView = lazy(() => loadWeekView().then((module) => ({ default: module.WeekView })))
const TaskSheet = lazy(() => import('./components/task/TaskSheet').then((module) => ({ default: module.TaskSheet })))
const SectionSheet = lazy(() => import('./components/section/SectionSheet').then((module) => ({ default: module.SectionSheet })))
const PlaceTasksSheet = lazy(() =>
  import('./components/places/PlaceTasksSheet').then((module) => ({ default: module.PlaceTasksSheet })),
)
const NativeWidget = lazy(() => import('./components/widget/NativeWidget').then((module) => ({ default: module.NativeWidget })))
const NativeInbox = lazy(() => import('./components/shell/NativeInbox').then((module) => ({ default: module.NativeInbox })))
const SettingsSheet = lazy(() => import('./components/settings/SettingsSheet').then((module) => ({ default: module.SettingsSheet })))

export function App() {
  const state = useAppState()
  const dispatch = useDispatch()
  const today = useToday()
  const typing = useKeyboardInset()
  const toast = useToast()
  const addTasks = useAddTasks()
  // La PWA no puede avisar por lugar: allí esas frases se dejan tal cual.
  const places = isNative ? state.places : null

  const [view, setView] = useState<ViewId>('home')
  const [weekAnchor, setWeekAnchor] = useState(today)
  const [selectedDay, setSelectedDay] = useState(today)
  const [taskId, setTaskId] = useState<string | null>(null)
  const [fromNotification, setFromNotification] = useState(false)
  const [sectionId, setSectionId] = useState<string | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  // Ajustes se abre poco: su código se carga la primera vez y luego sigue montado (animación de cierre).
  const [settingsLoaded, setSettingsLoaded] = useState(false)
  const [placeId, setPlaceId] = useState<string | null>(null)
  const [focusRequest, setFocusRequest] = useState(0)
  // Modo "Aa": las filas enseñan su mando de importancia en lugar del asa de mover.
  const [sizing, setSizing] = useState(false)

  useEffect(() => {
    // La pantalla de carga nativa espera a que haya estado que pintar.
    if (isNative) void import('./lib/platform/shell').then(({ showApp }) => showApp())
    // La vista semana, ya pintada la lista: tocar "Semana" no espera a la red.
    void loadWeekView()
  }, [])

  // Pasada la medianoche con la app abierta, lo que apuntaba a "hoy" pasa al día nuevo:
  // si no, el atajo de la semana crearía tareas ya atrasadas.
  const previousToday = useRef(today)
  useEffect(() => {
    const previous = previousToday.current
    if (previous === today) return
    previousToday.current = today
    setSelectedDay((day) => (day === previous ? today : day))
    setWeekAnchor((anchor) => (weekDays(anchor).includes(previous) ? today : anchor))
  }, [today])

  // Al cambiar de semana, el día al que apunta el atajo se mueve con ella.
  const changeWeek = (day: IsoDate) => {
    setWeekAnchor(day)
    const days = weekDays(day)
    setSelectedDay(days.includes(today) ? today : (days[0] ?? day))
  }

  const openTask = (id: string | null) => {
    setFromNotification(false)
    setTaskId(id)
  }

  useNotificationActions({
    onOpenTask: (id) => {
      setFromNotification(true)
      setTaskId(id)
    },
    onOpenPlace: setPlaceId,
  })

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

  // Lo que entendió la IA del servidor manda; si no hay nada válido, el analizador local.
  const addFromVoice = (text: string, interpreted: unknown) => {
    const now = Date.now()
    addSpoken(draftsFromInterpreted(interpreted, now, places) ?? [parseSpoken(text, now, places)].filter((draft) => draft.title))
  }

  const showWeek = () => withTransition(() => setView('week'))

  useNativeActions({
    onAdd: (text) => addSpoken([parseSpoken(text, Date.now(), places)].filter((draft) => draft.title)),
    onCompose: () => {
      setView('home')
      setFocusRequest((count) => count + 1)
    },
    onWeek: showWeek,
    onToday: () => {
      if (view !== 'home') withTransition(() => setView('home'))
    },
    onOpenTask: openTask,
    onInbox: () => window.dispatchEvent(new Event(INBOX_EVENT)),
  })

  const inWeek = view === 'week' && selectedDay !== today
  const quickDate = view === 'week' ? selectedDay : today
  const quickLabel = inWeek ? `${dayNameShort(selectedDay)} ${dayNumber(selectedDay)}` : 'Hoy'

  return (
    <div className={`app ${typing ? 'is-typing' : ''} ${sizing ? 'is-sizing' : ''}`}>
      <button
        type="button"
        className="app__sizing"
        aria-label="Importancia"
        aria-pressed={sizing}
        onClick={() => setSizing((on) => !on)}
      >
        <IconTextSize size={19} />
      </button>
      <button
        type="button"
        className="app__settings"
        aria-label="Ajustes"
        onClick={() => {
          setSettingsLoaded(true)
          setSettingsOpen(true)
        }}
      >
        <IconMore size={18} />
      </button>

      <main className="app__scroll">
        <SizingContext.Provider value={sizing}>
          {view === 'home' && <HomeView today={today} onOpenTask={openTask} onOpenSection={setSectionId} />}
          {view === 'week' && (
            <Suspense fallback={null}>
              <WeekView
                today={today}
                anchor={weekAnchor}
                selectedDay={selectedDay}
                onAnchorChange={changeWeek}
                onSelectDay={setSelectedDay}
                onOpenTask={openTask}
              />
            </Suspense>
          )}
        </SizingContext.Provider>
      </main>

      <div className="app__bar">
        <Composer
          quickLabel={quickLabel}
          quickDate={quickDate}
          places={places}
          focusRequest={focusRequest}
          onSubmit={(draft) => addTasks([draft])}
          onVoice={addFromVoice}
        />
        <BottomNav view={view} onChange={(next) => withTransition(() => setView(next))} />
      </div>

      <Suspense fallback={null}>
        <TaskSheet taskId={taskId} fromNotification={fromNotification} onClose={() => openTask(null)} />
        <SectionSheet sectionId={sectionId} onClose={() => setSectionId(null)} />
      </Suspense>
      {settingsLoaded && (
        <Suspense fallback={null}>
          <SettingsSheet open={settingsOpen} onClose={() => setSettingsOpen(false)} />
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
  )
}
