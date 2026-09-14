import { useState } from 'react'
import { dayNameShort, dayNumber, weekDays } from './lib/date'
import { withTransition } from './lib/transition'
import { useToday } from './hooks/useToday'
import { createId } from './lib/id'
import { draftsFromInterpreted } from './lib/interpret'
import { parseSpoken } from './lib/parse'
import { useDispatch } from './state/StoreProvider'
import type { IsoDate, ViewId } from './types'
import { Composer } from './components/compose/Composer'
import { useNotificationActions } from './components/push/useNotificationActions'
import { SectionSheet } from './components/section/SectionSheet'
import { SettingsSheet } from './components/settings/SettingsSheet'
import { BottomNav } from './components/shell/BottomNav'
import { useKeyboardInset } from './components/shell/useKeyboardInset'
import { TaskSheet } from './components/task/TaskSheet'
import { IconMore } from './components/ui/Icons'
import { useToast } from './components/ui/Toast'
import { HomeView } from './components/views/HomeView'
import { WeekView } from './components/views/WeekView'
import './components/shell/shell.css'

export function App() {
  const dispatch = useDispatch()
  const today = useToday()
  const typing = useKeyboardInset()
  const toast = useToast()

  const [view, setView] = useState<ViewId>('home')
  const [weekAnchor, setWeekAnchor] = useState(today)
  const [selectedDay, setSelectedDay] = useState(today)
  const [taskId, setTaskId] = useState<string | null>(null)
  const [fromNotification, setFromNotification] = useState(false)
  const [sectionId, setSectionId] = useState<string | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)

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

  useNotificationActions((id) => {
    setFromNotification(true)
    setTaskId(id)
  })

  // Lo dictado se crea sin pasos intermedios; el toast confirma qué se ha entendido.
  // Lo que entendió la IA del servidor manda; si no hay nada válido, el analizador local.
  const addFromVoice = (text: string, interpreted: unknown) => {
    const now = Date.now()
    const drafts = draftsFromInterpreted(interpreted, now) ?? [parseSpoken(text, now)].filter((draft) => draft.title)
    if (!drafts.length) return

    const ids = drafts.map(({ title, date, time, reminders }) => {
      const id = createId()
      dispatch({ type: 'task/add', id, title, date, time, reminders, sectionId: null })
      return id
    })
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

  const inWeek = view === 'week' && selectedDay !== today
  const quickDate = view === 'week' ? selectedDay : today
  const quickLabel = inWeek ? `${dayNameShort(selectedDay)} ${dayNumber(selectedDay)}` : 'Hoy'

  return (
    <div className={`app ${typing ? 'is-typing' : ''}`}>
      <button type="button" className="app__settings" aria-label="Ajustes" onClick={() => setSettingsOpen(true)}>
        <IconMore size={18} />
      </button>

      <main className="app__scroll">
        {view === 'home' && <HomeView today={today} onOpenTask={openTask} onOpenSection={setSectionId} />}
        {view === 'week' && (
          <WeekView
            anchor={weekAnchor}
            selectedDay={selectedDay}
            onAnchorChange={changeWeek}
            onSelectDay={setSelectedDay}
            onOpenTask={openTask}
          />
        )}
      </main>

      <div className="app__bar">
        <Composer
          quickLabel={quickLabel}
          quickDate={quickDate}
          onSubmit={(draft) => dispatch({ type: 'task/add', ...draft, sectionId: null })}
          onVoice={addFromVoice}
        />
        <BottomNav view={view} onChange={(next) => withTransition(() => setView(next))} />
      </div>

      <TaskSheet taskId={taskId} fromNotification={fromNotification} onClose={() => openTask(null)} />
      <SectionSheet sectionId={sectionId} onClose={() => setSectionId(null)} />
      <SettingsSheet open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  )
}
