import { useState } from 'react'
import { relativeLabel } from './lib/date'
import { withTransition } from './lib/transition'
import { useToday } from './hooks/useToday'
import { useDispatch } from './state/StoreProvider'
import type { ViewId } from './types'
import { Composer } from './components/compose/Composer'
import { SectionSheet } from './components/section/SectionSheet'
import { SettingsSheet } from './components/settings/SettingsSheet'
import { BottomNav } from './components/shell/BottomNav'
import { useKeyboardInset } from './components/shell/useKeyboardInset'
import { TaskSheet } from './components/task/TaskSheet'
import { IconMore } from './components/ui/Icons'
import { BacklogView } from './components/views/BacklogView'
import { TodayView } from './components/views/TodayView'
import { WeekView } from './components/views/WeekView'
import './components/shell/shell.css'

export function App() {
  const dispatch = useDispatch()
  const today = useToday()
  const typing = useKeyboardInset()

  const [view, setView] = useState<ViewId>('today')
  const [weekAnchor, setWeekAnchor] = useState(today)
  const [selectedDay, setSelectedDay] = useState(today)
  const [taskId, setTaskId] = useState<string | null>(null)
  const [sectionId, setSectionId] = useState<string | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)

  const target = view === 'today' ? today : view === 'week' ? selectedDay : null
  const placeholder =
    view === 'backlog' ? 'Añadir sin fecha' : `Añadir a ${relativeLabel(target ?? today, today).toLowerCase()}`

  return (
    <div className={`app ${typing ? 'is-typing' : ''}`}>
      <button type="button" className="app__settings" aria-label="Ajustes" onClick={() => setSettingsOpen(true)}>
        <IconMore size={18} />
      </button>

      <main className="app__scroll">
        {view === 'today' && <TodayView date={today} onOpenTask={setTaskId} onOpenSection={setSectionId} />}
        {view === 'week' && (
          <WeekView
            anchor={weekAnchor}
            selectedDay={selectedDay}
            onAnchorChange={setWeekAnchor}
            onSelectDay={setSelectedDay}
            onOpenTask={setTaskId}
          />
        )}
        {view === 'backlog' && <BacklogView onOpenTask={setTaskId} />}
      </main>

      <div className="app__bar">
        <Composer
          placeholder={placeholder}
          onSubmit={(title) => dispatch({ type: 'task/add', title, date: target, sectionId: null })}
        />
        <BottomNav view={view} onChange={(next) => withTransition(() => setView(next))} />
      </div>

      <TaskSheet taskId={taskId} onClose={() => setTaskId(null)} />
      <SectionSheet sectionId={sectionId} onClose={() => setSectionId(null)} />
      <SettingsSheet open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  )
}
