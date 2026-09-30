import { useEffect, useRef, useState } from 'react'
import { backupFilename, parseBackup, serializeBackup } from '../../lib/backup'
import { isNative } from '../../lib/platform'
import { haptic } from '../../lib/platform/feedback'
import { useAppState, useDispatch } from '../../state/StoreProvider'
import { IconArrowUpRight, IconChevronRight, IconDownload, IconTrash, IconUpload } from '../ui/Icons'
import { useToast } from '../ui/Toast'
import { AppearancePicker } from './AppearancePicker'
import { DictationBlock } from './DictationBlock'
import { NotificationsBlock } from './NotificationsBlock'
import './settings.css'

const SITE = 'https://diegomolinacatala.github.io/tasks/'
const APP_STORE = 'https://apps.apple.com/es/app/tasks-tareas-y-lugares/id6812776586'
const CONFIRM_MS = 4000

interface SettingsViewProps {
  /** Volver a ver la bienvenida del primer día. */
  onWelcome: () => void
}

/** Ajustes: una página propia, en grupos como los de iOS, con el papel y la tinta de la app. */
export function SettingsView({ onWelcome }: SettingsViewProps) {
  const state = useAppState()
  const dispatch = useDispatch()
  const toast = useToast()
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
        toast({ message: 'No se pudo exportar la copia.' })
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
      toast({ message: 'Copia importada.' })
    } catch (error) {
      toast({ message: error instanceof Error ? error.message : 'No se pudo importar el fichero.' })
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
    toast({ message: 'Todo borrado.' })
  }

  return (
    <div className="view settings">
      <header className="view__head">
        <p className="view__kicker">Tasks</p>
        <div className="view__headline">
          <h1 className="view__title">Ajustes</h1>
        </div>
        <div className="view__progress view__progress--plain" aria-hidden="true" />
      </header>

      <section className="group">
        <h2 className="group__title">Apariencia</h2>
        <AppearancePicker value={state.settings.theme} />
      </section>

      <NotificationsBlock />
      <DictationBlock />

      <section className="group">
        <h2 className="group__title">Datos</h2>
        <div className="group__stats">
          {(
            [
              [pending, 'pendiente', 'pendientes'],
              [state.tasks.length, 'tarea', 'tareas'],
              [state.routines.length, 'rutina', 'rutinas'],
              [state.sections.length, 'sección', 'secciones'],
            ] as const
          ).map(([count, one, many]) => (
            <span key={many}>
              <b>{count}</b> {count === 1 ? one : many}
            </span>
          ))}
        </div>
        <div className="group__card">
          <button type="button" className="group__row" onClick={() => void exportBackup()}>
            <IconDownload size={18} />
            <span className="group__label">Exportar copia</span>
            <span className="group__value">.json</span>
          </button>
          <button type="button" className="group__row" onClick={() => fileInput.current?.click()}>
            <IconUpload size={18} />
            <span className="group__label">Importar copia</span>
          </button>
          <button type="button" className={`group__row group__row--danger ${confirming ? 'is-confirming' : ''}`} onClick={clearAll}>
            <IconTrash size={18} />
            <span className="group__label">{confirming ? 'Toca otra vez para borrarlo todo' : 'Borrar todo'}</span>
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
        <p className="group__note">Todo se guarda solo en este dispositivo. Importar sustituye lo que haya ahora.</p>
      </section>

      <section className="group">
        <h2 className="group__title">Tasks</h2>
        <div className="group__card">
          <button type="button" className="group__row" onClick={onWelcome}>
            <span className="group__label">Ver la bienvenida</span>
            <IconChevronRight size={16} className="group__chevron" />
          </button>
          {isNative && (
            <a className="group__row" href={`${APP_STORE}?action=write-review`} target="_blank" rel="noopener noreferrer">
              <span className="group__label">Valorar en la App Store</span>
              <IconArrowUpRight size={16} className="group__chevron" />
            </a>
          )}
          <a className="group__row" href={`${SITE}soporte.html`} target="_blank" rel="noopener noreferrer">
            <span className="group__label">Soporte</span>
            <IconArrowUpRight size={16} className="group__chevron" />
          </a>
          <a className="group__row" href={`${SITE}privacidad.html`} target="_blank" rel="noopener noreferrer">
            <span className="group__label">Privacidad</span>
            <IconArrowUpRight size={16} className="group__chevron" />
          </a>
        </div>
        {version && <p className="group__note group__note--center">Versión {version}</p>}
      </section>
    </div>
  )
}
