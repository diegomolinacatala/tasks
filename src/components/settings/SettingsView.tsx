import { useEffect, useRef, useState } from 'react'
import { backupFilename, parseBackup, serializeBackup } from '../../lib/backup'
import { isNative } from '../../lib/platform'
import { haptic } from '../../lib/platform/feedback'
import { useCopy } from '../../state/LanguageProvider'
import { useAppState, useDispatch } from '../../state/StoreProvider'
import { IconArrowUpRight, IconChevronRight, IconDownload, IconTrash, IconUpload } from '../ui/Icons'
import { useToast } from '../ui/Toast'
import { AppearancePicker } from './AppearancePicker'
import { DictationBlock } from './DictationBlock'
import { LanguagePicker } from './LanguagePicker'
import { NotificationsBlock } from './NotificationsBlock'
import './settings.css'

const SITE = 'https://diegomolinacatala.github.io/tasks/'
const APP_STORE = 'https://apps.apple.com/app/id6812776586'
const CONFIRM_MS = 4000

const COPY = {
  es: {
    exportFailed: 'No se pudo exportar la copia.',
    imported: 'Copia importada.',
    importFailed: 'No se pudo importar el fichero.',
    cleared: 'Todo borrado.',
    title: 'Ajustes',
    appearance: 'Apariencia',
    data: 'Datos',
    stats: [
      ['pendiente', 'pendientes'],
      ['tarea', 'tareas'],
      ['rutina', 'rutinas'],
      ['sección', 'secciones'],
    ],
    export: 'Exportar copia',
    import: 'Importar copia',
    confirm: 'Toca otra vez para borrarlo todo',
    clear: 'Borrar todo',
    dataNote: 'Todo se guarda solo en este dispositivo. Importar sustituye lo que haya ahora.',
    welcome: 'Ver la bienvenida',
    rate: 'Valorar en la App Store',
    support: 'Soporte',
    privacy: 'Privacidad',
    supportPage: 'soporte.html',
    privacyPage: 'privacidad.html',
    version: (value: string) => `Versión ${value}`,
  },
  en: {
    exportFailed: 'The backup couldn’t be exported.',
    imported: 'Backup imported.',
    importFailed: 'The file couldn’t be imported.',
    cleared: 'Everything deleted.',
    title: 'Settings',
    appearance: 'Appearance',
    data: 'Data',
    stats: [
      ['pending', 'pending'],
      ['task', 'tasks'],
      ['routine', 'routines'],
      ['section', 'sections'],
    ],
    export: 'Export backup',
    import: 'Import backup',
    confirm: 'Tap again to delete everything',
    clear: 'Delete everything',
    dataNote: 'Everything is stored only on this device. Importing replaces what’s here now.',
    welcome: 'See the welcome',
    rate: 'Rate on the App Store',
    support: 'Support',
    privacy: 'Privacy',
    supportPage: 'support.html',
    privacyPage: 'privacy.html',
    version: (value: string) => `Version ${value}`,
  },
} as const

interface SettingsViewProps {
  /** Volver a ver la bienvenida del primer día. */
  onWelcome: () => void
}

/** Ajustes: una página propia, en grupos como los de iOS, con el papel y la tinta de la app. */
export function SettingsView({ onWelcome }: SettingsViewProps) {
  const state = useAppState()
  const dispatch = useDispatch()
  const toast = useToast()
  const copy = useCopy(COPY)
  const fileInput = useRef<HTMLInputElement>(null)
  const [confirming, setConfirming] = useState(false)
  const [version, setVersion] = useState<string | null>(null)

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

  const pending = state.tasks.filter((task) => !task.done).length

  const exportBackup = async () => {
    if (isNative) {
      try {
        const { shareFile } = await import('../../lib/platform/share')
        await shareFile(backupFilename(), serializeBackup(state))
      } catch {
        toast({ message: copy.exportFailed })
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
  }

  const importBackup = async (file: File) => {
    try {
      dispatch({ type: 'state/import', state: parseBackup(await file.text()) })
      haptic('success')
      toast({ message: copy.imported })
    } catch (error) {
      toast({ message: error instanceof Error ? error.message : copy.importFailed })
    }
  }

  const clearAll = () => {
    if (!confirming) {
      setConfirming(true)
      haptic('warning')
      return
    }
    dispatch({ type: 'state/clear' })
    setConfirming(false)
    toast({ message: copy.cleared })
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

      <section className="group">
        <h2 className="group__title">{copy.appearance}</h2>
        <AppearancePicker value={state.settings.theme} />
      </section>

      <LanguagePicker value={state.settings.language} />

      <NotificationsBlock />
      <DictationBlock />

      <section className="group">
        <h2 className="group__title">{copy.data}</h2>
        <div className="group__stats">
          {[pending, state.tasks.length, state.routines.length, state.sections.length].map((count, index) => {
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
            <span className="group__value">.json</span>
          </button>
          <button type="button" className="group__row" onClick={() => fileInput.current?.click()}>
            <IconUpload size={18} />
            <span className="group__label">{copy.import}</span>
          </button>
          <button type="button" className={`group__row group__row--danger ${confirming ? 'is-confirming' : ''}`} onClick={clearAll}>
            <IconTrash size={18} />
            <span className="group__label">{confirming ? copy.confirm : copy.clear}</span>
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
          <a className="group__row" href={`${SITE}${copy.supportPage}`} target="_blank" rel="noopener noreferrer">
            <span className="group__label">{copy.support}</span>
            <IconArrowUpRight size={16} className="group__chevron" />
          </a>
          <a className="group__row" href={`${SITE}${copy.privacyPage}`} target="_blank" rel="noopener noreferrer">
            <span className="group__label">{copy.privacy}</span>
            <IconArrowUpRight size={16} className="group__chevron" />
          </a>
        </div>
        {version && <p className="group__note group__note--center">{copy.version(version)}</p>}
      </section>
    </div>
  )
}
