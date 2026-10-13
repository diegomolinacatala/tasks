import { useEffect, useRef, useState } from 'react'
import { backupFilename, parseBackup, serializeBackup } from '../../lib/backup'
import { isNative } from '../../lib/platform'
import { haptic } from '../../lib/platform/feedback'
import { useCopy } from '../../state/LanguageProvider'
import type { Action } from '../../state/actions'
import { useAppState, useDispatch } from '../../state/StoreProvider'
import type { AppState } from '../../types'
import { IconArrowUpRight, IconChevronRight, IconDownload, IconFeather, IconTrash, IconUpload } from '../ui/Icons'
import { useAvailableUpdate } from '../update/updateState'
import { useToast } from '../ui/Toast'
import { AppearancePicker } from './AppearancePicker'
import { CalendarBlock } from './CalendarBlock'
import { DictationBlock } from './DictationBlock'
import { LanguagePicker } from './LanguagePicker'
import { NotificationsBlock } from './NotificationsBlock'
import './settings.css'

const SITE = 'https://diegomolinacatala.github.io/tasks/'
const APP_STORE = 'https://apps.apple.com/app/id6812776586'
const CONFIRM_MS = 4000
/** Leer el fichero y decidir si sustituye lo que hay lleva más que un segundo toque. */
const IMPORT_CONFIRM_MS = 10_000

const COPY = {
  es: {
    exportFailed: 'No se pudo exportar la copia.',
    exported: (name: string) => `Copia guardada: ${name}`,
    imported: (tasks: number, routines: number) => `Copia importada: ${tasks} tareas, ${routines} rutinas`,
    importFailed: 'No se pudo importar el fichero.',
    replace: (mine: number, theirs: number) => `Sustituir mis ${mine} tareas por las ${theirs} de la copia`,
    undo: 'Deshacer',
    cleared: 'Todo borrado.',
    title: 'Ajustes',
    appearance: 'Apariencia',
    help: 'Ayuda',
    data: 'Datos',
    stats: [
      ['tarea', 'tareas'],
      ['pendiente', 'pendientes'],
      ['rutina', 'rutinas'],
      ['sección', 'secciones'],
      ['lugar', 'lugares'],
    ],
    export: 'Exportar copia',
    import: 'Importar copia',
    confirm: (summary: string) => `Toca otra vez: borrar ${summary}`,
    things: (tasks: number, routines: number, places: number) =>
      [`${tasks} tareas`, `${routines} rutinas`, ...(places ? [`${places} lugares`] : [])].join(', ').replace(/, ([^,]*)$/, ' y $1'),
    clear: 'Borrar todo',
    dataNote: 'Todo se guarda solo en este dispositivo. Importar sustituye lo que haya ahora.',
    welcome: 'Ver la bienvenida otra vez',
    suggest: 'Sugerir una mejora',
    suggestNote: 'Rodea lo que cambiarías y cuéntalo.',
    rate: 'Valorar en la App Store',
    support: 'Soporte',
    privacy: 'Privacidad',
    supportPage: 'soporte.html',
    privacyPage: 'privacidad.html',
    version: (value: string) => `Versión ${value}`,
    build: (day: string) => `Versión web del ${day.slice(8, 10)}/${day.slice(5, 7)}/${day.slice(0, 4)}`,
    update: (value: string) => `Actualizar a la ${value}`,
  },
  en: {
    exportFailed: 'The backup couldn’t be exported.',
    exported: (name: string) => `Backup saved: ${name}`,
    imported: (tasks: number, routines: number) => `Backup imported: ${tasks} tasks, ${routines} routines`,
    importFailed: 'The file couldn’t be imported.',
    replace: (mine: number, theirs: number) => `Replace my ${mine} tasks with the backup’s ${theirs}`,
    undo: 'Undo',
    cleared: 'Everything deleted.',
    title: 'Settings',
    appearance: 'Appearance',
    help: 'Help',
    data: 'Data',
    stats: [
      ['task', 'tasks'],
      ['pending', 'pending'],
      ['routine', 'routines'],
      ['section', 'sections'],
      ['place', 'places'],
    ],
    export: 'Export backup',
    import: 'Import backup',
    confirm: (summary: string) => `Tap again: delete ${summary}`,
    things: (tasks: number, routines: number, places: number) =>
      [`${tasks} tasks`, `${routines} routines`, ...(places ? [`${places} places`] : [])].join(', ').replace(/, ([^,]*)$/, ' and $1'),
    clear: 'Delete everything',
    dataNote: 'Everything is stored only on this device. Importing replaces what’s here now.',
    welcome: 'See the intro again',
    suggest: 'Suggest an improvement',
    suggestNote: 'Circle what you’d change and say it.',
    rate: 'Rate on the App Store',
    support: 'Support',
    privacy: 'Privacy',
    supportPage: 'support.html',
    privacyPage: 'privacy.html',
    version: (value: string) => `Version ${value}`,
    build: (day: string) => `Web build ${day.slice(5, 7)}/${day.slice(8, 10)}/${day.slice(0, 4)}`,
    update: (value: string) => `Update to ${value}`,
  },
} as const

interface SettingsViewProps {
  /** Volver a ver la bienvenida del primer día. */
  onWelcome: () => void
  /** Entrar en el modo sugerencia. Sin servidor (en local) no hay. */
  onSuggest?: () => void
}

/** Ajustes: una página propia, en grupos como los de iOS, con el papel y la tinta de la app. */
export function SettingsView({ onWelcome, onSuggest }: SettingsViewProps) {
  const state = useAppState()
  const dispatch = useDispatch()
  const toast = useToast()
  const copy = useCopy(COPY)
  const fileInput = useRef<HTMLInputElement>(null)
  const [confirming, setConfirming] = useState(false)
  // Una copia leída y a la espera de un segundo toque que confirme que sustituye lo que hay.
  const [incoming, setIncoming] = useState<AppState | null>(null)
  const [version, setVersion] = useState<string | null>(null)
  const update = useAvailableUpdate()

  useEffect(() => {
    if (!isNative) return
    void import('@capacitor/app')
      .then(({ App }) => App.getInfo())
      .then((info) => setVersion(`${info.version} (${info.build})`))
      .catch(() => undefined)
  }, [])

  useEffect(() => {
    if (!confirming) return
    const timer = window.setTimeout(() => setConfirming(false), CONFIRM_MS)
    return () => window.clearTimeout(timer)
  }, [confirming])

  useEffect(() => {
    if (!incoming) return
    const timer = window.setTimeout(() => setIncoming(null), IMPORT_CONFIRM_MS)
    return () => window.clearTimeout(timer)
  }, [incoming])

  const pending = state.tasks.filter((task) => !task.done).length
  const hasData = state.tasks.length > 0 || state.routines.length > 0 || state.places.length > 0

  /** Lo que había antes de sustituirlo o borrarlo vuelve entero con «Deshacer». */
  const replaceWithUndo = (next: Action, message: string) => {
    const previous = state
    dispatch(next)
    haptic('success')
    toast({ message, actionLabel: copy.undo, onAction: () => dispatch({ type: 'state/replace', state: previous }) })
  }

  const exportBackup = async () => {
    if (isNative) {
      try {
        const { shareFile } = await import('../../lib/platform/share')
        await shareFile(backupFilename(), serializeBackup(state))
      } catch {
        toast({ message: copy.exportFailed, tone: 'error' })
      }
      return
    }
    const blob = new Blob([serializeBackup(state)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = backupFilename()
    link.click()
    window.setTimeout(() => URL.revokeObjectURL(url), 2000)
    toast({ message: copy.exported(backupFilename()) })
  }

  const applyImport = (next: AppState) => {
    setIncoming(null)
    replaceWithUndo({ type: 'state/import', state: next }, copy.imported(next.tasks.length, next.routines.length))
  }

  // Con algo guardado, importar pide un segundo toque que dice qué se sustituye; vacío, va directo.
  const importBackup = async (file: File) => {
    try {
      const next = parseBackup(await file.text())
      if (!hasData) return applyImport(next)
      setIncoming(next)
      haptic('warning')
    } catch (error) {
      toast({ message: error instanceof Error ? error.message : copy.importFailed, tone: 'error' })
    }
  }

  const clearAll = () => {
    if (!confirming) {
      setConfirming(true)
      haptic('warning')
      return
    }
    setConfirming(false)
    replaceWithUndo({ type: 'state/clear' }, copy.cleared)
  }

  return (
    <div className="view settings">
      <header className="view__head">
        <p className="view__kicker">Tasks</p>
        <div className="view__headline">
          <h1 className="view__title">{copy.title}</h1>
        </div>
        <div className="view__progress view__progress--plain" aria-hidden="true" />
      </header>

      <LanguagePicker value={state.settings.language} />

      <section className="group">
        <h2 className="group__title">{copy.appearance}</h2>
        <AppearancePicker value={state.settings.theme} />
      </section>

      <NotificationsBlock />
      <CalendarBlock />
      <DictationBlock />

      {/* Lo que quieres que tus amigos encuentren va antes que los datos, no al final de la página. */}
      <section className="group">
        <h2 className="group__title">{copy.help}</h2>
        <div className="group__card">
          {onSuggest && (
            <button type="button" className="group__row" onClick={onSuggest}>
              <IconFeather size={18} />
              <span className="group__label">{copy.suggest}</span>
              <IconChevronRight size={16} className="group__chevron" />
            </button>
          )}
          <a className="group__row" href={`${SITE}${copy.supportPage}`} target="_blank" rel="noopener noreferrer">
            <span className="group__label">{copy.support}</span>
            <IconArrowUpRight size={16} className="group__chevron" />
          </a>
        </div>
        {onSuggest && <p className="group__note">{copy.suggestNote}</p>}
      </section>

      <section className="group">
        <h2 className="group__title">{copy.data}</h2>
        <div className="group__stats">
          {[state.tasks.length, pending, state.routines.length, state.sections.length, state.places.length].map((count, index) => {
            const [one, many] = copy.stats[index] ?? ['', '']
            return (
              <span key={index}>
                <b>{count}</b> {count === 1 ? one : many}
              </span>
            )
          })}
        </div>
        <div className="group__card">
          <button type="button" className="group__row" onClick={() => void exportBackup()}>
            <IconDownload size={18} />
            <span className="group__label">{copy.export}</span>
          </button>
          {incoming ? (
            <button type="button" className="group__row group__row--danger is-confirming" onClick={() => applyImport(incoming)}>
              <IconUpload size={18} />
              <span className="group__label">{copy.replace(state.tasks.length, incoming.tasks.length)}</span>
            </button>
          ) : (
            <button type="button" className="group__row" onClick={() => fileInput.current?.click()}>
              <IconUpload size={18} />
              <span className="group__label">{copy.import}</span>
            </button>
          )}
          <button type="button" className={`group__row group__row--danger ${confirming ? 'is-confirming' : ''}`} onClick={clearAll}>
            <IconTrash size={18} />
            <span className="group__label">
              {confirming ? copy.confirm(copy.things(state.tasks.length, state.routines.length, state.places.length)) : copy.clear}
            </span>
          </button>
        </div>
        <input
          ref={fileInput}
          type="file"
          accept="application/json,.json"
          className="sr-only"
          onChange={(event) => {
            const file = event.target.files?.[0]
            event.target.value = ''
            if (file) void importBackup(file)
          }}
        />
        <p className="group__note">{copy.dataNote}</p>
      </section>

      <section className="group">
        <h2 className="group__title">Tasks</h2>
        {update && (
          <div className="group__card settings__update">
            <a className="group__row" href={update.url} target="_blank" rel="noopener noreferrer">
              <IconDownload size={18} />
              <span className="group__label">{copy.update(update.version)}</span>
              <IconArrowUpRight size={16} className="group__chevron" />
            </a>
          </div>
        )}
        <div className="group__card">
          <button type="button" className="group__row" onClick={onWelcome}>
            <span className="group__label">{copy.welcome}</span>
            <IconChevronRight size={16} className="group__chevron" />
          </button>
          {isNative && (
            <a className="group__row" href={`${APP_STORE}?action=write-review`} target="_blank" rel="noopener noreferrer">
              <span className="group__label">{copy.rate}</span>
              <IconArrowUpRight size={16} className="group__chevron" />
            </a>
          )}
          <a className="group__row" href={`${SITE}${copy.privacyPage}`} target="_blank" rel="noopener noreferrer">
            <span className="group__label">{copy.privacy}</span>
            <IconArrowUpRight size={16} className="group__chevron" />
          </a>
        </div>
        <p className="group__note group__note--center">{version ? copy.version(version) : copy.build(__BUILD_DATE__)}</p>
      </section>
    </div>
  )
}
