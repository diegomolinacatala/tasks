import { useRef, useState } from 'react'
import { backupFilename, parseBackup, serializeBackup } from '../../lib/backup'
import { useAppState, useDispatch } from '../../state/StoreProvider'
import { IconDownload, IconTrash, IconUpload } from '../ui/Icons'
import { Sheet } from '../ui/Sheet'
import { useToast } from '../ui/Toast'

interface SettingsSheetProps {
  open: boolean
  onClose: () => void
}

export function SettingsSheet({ open, onClose }: SettingsSheetProps) {
  const state = useAppState()
  const dispatch = useDispatch()
  const toast = useToast()
  const fileInput = useRef<HTMLInputElement>(null)
  const [confirming, setConfirming] = useState(false)

  const pending = state.tasks.filter((task) => !task.done).length

  const exportBackup = () => {
    const blob = new Blob([serializeBackup(state)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = backupFilename()
    link.click()
    setTimeout(() => URL.revokeObjectURL(url), 2000)
  }

  const importBackup = async (file: File) => {
    try {
      dispatch({ type: 'state/replace', state: parseBackup(await file.text()) })
      toast({ message: 'Copia importada.' })
      onClose()
    } catch (error) {
      toast({ message: error instanceof Error ? error.message : 'No se pudo importar el fichero.' })
    }
  }

  const clearAll = () => {
    if (!confirming) {
      setConfirming(true)
      setTimeout(() => setConfirming(false), 4000)
      return
    }
    dispatch({ type: 'state/clear' })
    setConfirming(false)
    onClose()
  }

  return (
    <Sheet open={open} onClose={onClose} title="Ajustes">
      <p className="sheet__title">Datos</p>
      <p className="sheet__note">
        {state.tasks.length} tareas · {pending} pendientes · {state.sections.length} secciones
      </p>

      <button type="button" className="sheet__row" onClick={exportBackup}>
        <IconDownload size={18} />
        Exportar copia (.json)
      </button>

      <button type="button" className="sheet__row" onClick={() => fileInput.current?.click()}>
        <IconUpload size={18} />
        Importar copia
      </button>
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

      <button type="button" className="sheet__row sheet__row--danger" onClick={clearAll}>
        <IconTrash size={18} />
        {confirming ? 'Toca otra vez para confirmar' : 'Borrar todo'}
      </button>

      <p className="sheet__note">
        Todo se guarda solo en este dispositivo. Importar sustituye lo que haya ahora.
      </p>
    </Sheet>
  )
}
