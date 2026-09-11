import { useEffect, useState } from 'react'
import { useAppState, useDispatch } from '../../state/StoreProvider'
import { findSection } from '../../state/selectors'
import type { Section } from '../../types'
import { IconTrash } from '../ui/Icons'
import { Sheet } from '../ui/Sheet'

interface SectionSheetProps {
  sectionId: string | null
  onClose: () => void
}

export function SectionSheet({ sectionId, onClose }: SectionSheetProps) {
  const state = useAppState()
  const dispatch = useDispatch()
  const section = findSection(state, sectionId)
  const [shown, setShown] = useState<Section | null>(section)
  const [name, setName] = useState(section?.name ?? '')

  useEffect(() => {
    if (!section) return
    setShown(section)
    setName(section.name)
  }, [section?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!shown) return null

  const commit = () => {
    if (section && name.trim() && name !== section.name) {
      dispatch({ type: 'section/rename', id: section.id, name })
    }
  }

  const close = () => {
    commit()
    onClose()
  }

  return (
    <Sheet open={Boolean(section)} onClose={close} title="Editar sección">
      <p className="sheet__title">Nombre</p>
      <input
        className="sheet__input"
        value={name}
        onChange={(event) => setName(event.target.value)}
        onBlur={commit}
        aria-label="Nombre de la sección"
      />
      <button
        type="button"
        className="sheet__row sheet__row--danger"
        onClick={() => {
          if (section) dispatch({ type: 'section/remove', id: section.id })
          onClose()
        }}
      >
        <IconTrash size={18} />
        Borrar sección
      </button>
      <p className="sheet__note">Las tareas de la sección vuelven a la lista principal del día.</p>
    </Sheet>
  )
}
