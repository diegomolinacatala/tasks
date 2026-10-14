import { useEffect, useRef, useState } from 'react'
import { backupFilename, parseBackup, serializeBackup } from '../../lib/backup'
import { isNative } from '../../lib/platform'
import { haptic } from '../../lib/platform/feedback'
import { useCopy } from '../../state/LanguageProvider'
import type { Action } from '../../state/actions'
import { useAppState, useDispatch } from '../../state/StoreProvider'
import type { AppState } from '../../types'
import { IconArchive, IconDownload, IconTrash, IconUpload } from '../ui/Icons'
import { Sheet } from '../ui/Sheet'
import { useToast } from '../ui/Toast'
import { SettingsRow, SettingsSheetTitle } from './SettingsRow'

const CONFIRM_MS = 4000
/** Leer el fichero y decidir si sustituye lo que hay lleva más que un segundo toque. */
const IMPORT_CONFIRM_MS = 10_000

const COPY = {
  es: {
    title: 'Copias y datos',
    count: (tasks: number) => (tasks === 1 ? '1 tarea' : `${tasks} tareas`),
    exportFailed: 'No se pudo exportar la copia.',
    exported: (name: string) => `Copia guardada: ${name}`,
    imported: (tasks: number, routines: number) => `Copia importada: ${tasks} tareas, ${routines} rutinas`,
    importFailed: 'No se pudo importar el fichero.',
    replace: (mine: number, theirs: number) => `Sustituir mis ${mine} tareas por las ${theirs} de la copia`,
    undo: 'Deshacer',
    cleared: 'Todo borrado.',
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
  },
  en: {
    title: 'Backups & data',
    count: (tasks: number) => (tasks === 1 ? '1 task' : `${tasks} tasks`),
    exportFailed: 'The backup couldn’t be exported.',
    exported: (name: string) => `Backup saved: ${name}`,
    imported: (tasks: number, routines: number) => `Backup imported: ${tasks} tasks, ${routines} routines`,
    importFailed: 'The file couldn’t be imported.',
    replace: (mine: number, theirs: number) => `Replace my ${mine} tasks with the backup’s ${theirs}`,
    undo: 'Undo',
    cleared: 'Everything deleted.',
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
  },
} as const

/**
 * Ajustes → Copias y datos: una fila con cuántas tareas hay y, en su panel, las cifras, exportar,
 * importar (un segundo toque dice qué se sustituye) y borrar todo, los dos con «Deshacer».
 */
export function DataRow() {
  const state = useAppState()
  const dispatch = useDispatch()
  const toast = useToast()
  const copy = useCopy(COPY)
  const fileInput = useRef<HTMLInputElement>(null)
  const [open, setOpen] = useState(false)
  const [confirming, setConfirming] = useState(false)
  // Una copia leída y a la espera de un segundo toque que confirme que sustituye lo que hay.
  const [incoming, setIncoming] = useState<AppState | null>(null)

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
    <>
      <SettingsRow icon={<IconArchive size={17} />} label={copy.title} value={copy.count(state.tasks.length)} onClick={() => setOpen(true)} />
      <Sheet open={open} onClose={() => setOpen(false)} title={copy.title}>
        <SettingsSheetTitle>{copy.title}</SettingsSheetTitle>
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
      </Sheet>
    </>
  )
}
