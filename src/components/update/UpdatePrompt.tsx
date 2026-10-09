import { useCallback, useEffect, useRef, useState } from 'react'
import type { StoreCheck } from '../../lib/update'
import { offeredUpdate, parseStoreCheck, storeLocale } from '../../lib/update'
import { isNative } from '../../lib/platform'
import { haptic } from '../../lib/platform/feedback'
import { useCopy, useLanguage } from '../../state/LanguageProvider'
import { Sheet } from '../ui/Sheet'
import { setAvailableUpdate, useAvailableUpdate } from './updateState'
import './update.css'

/** Lo que se espera tras abrir la app: que entre antes de pedirle nada. */
const FIRST_CHECK_MS = 3000
/** Al volver a la app, como mucho una búsqueda cada seis horas. */
const CHECK_EVERY_MS = 6 * 60 * 60 * 1000
/** La versión a la que se dijo "Ahora no": no vuelve a salir sola (sigue en Ajustes). */
const DISMISSED_KEY = 'tasks:update-dismissed'
/** En local: `localStorage.setItem('tasks:demo-update', '1.7')` para ver el aviso. */
const DEMO_KEY = 'tasks:demo-update'

const COPY = {
  es: {
    sheet: 'Actualización',
    kicker: 'Actualización',
    title: (version: string) => `Tasks ${version} ya está aquí`,
    lead: 'Se actualiza en un toque desde la App Store. Tus tareas se quedan como están.',
    news: 'Novedades',
    update: 'Actualizar',
    later: 'Ahora no',
  },
  en: {
    sheet: 'Update',
    kicker: 'Update',
    title: (version: string) => `Tasks ${version} is here`,
    lead: 'Update with one tap from the App Store. Your tasks stay just as they are.',
    news: 'What’s new',
    update: 'Update',
    later: 'Not now',
  },
} as const

const readDismissed = (): string | null => {
  try {
    return localStorage.getItem(DISMISSED_KEY)
  } catch {
    return null
  }
}

/** La versión de la App Store y la instalada. En local, una de muestra si se ha pedido. */
async function lookup(language: 'es' | 'en'): Promise<StoreCheck> {
  const region = navigator.language.split('-')[1] ?? null
  if (isNative) {
    const { TasksNative } = await import('../../lib/platform/native')
    return parseStoreCheck(await TasksNative.storeVersion(storeLocale(language, region)))
  }
  const demo = (() => {
    try {
      return localStorage.getItem(DEMO_KEY)
    } catch {
      return null
    }
  })()
  const notes =
    language === 'en'
      ? '• Your calendar in the Agenda.\n• Your timed tasks in the calendar you choose.\n• A + on each section.'
      : '• Tu calendario en la Agenda.\n• Tus tareas con hora, en el calendario que elijas.\n• Un + en cada sección.'
  return parseStoreCheck(demo ? { installed: '1.6', version: demo, notes } : { installed: '1.6' })
}

interface UpdatePromptProps {
  /** Hay algo delante (la bienvenida, el modo sugerencia): el aviso espera. */
  paused: boolean
}

/**
 * Cuando sale una versión nueva en la App Store, al abrir la app (o volver a ella) sube una ficha con sus
 * novedades y **Actualizar**, que abre la página de la app en la App Store (iOS no deja actualizar desde
 * dentro: es un toque más allí). **Ahora no** la aparta para esa versión; la fila de Ajustes sigue.
 */
export function UpdatePrompt({ paused }: UpdatePromptProps) {
  const copy = useCopy(COPY)
  const language = useLanguage()
  const release = useAvailableUpdate()
  const [open, setOpen] = useState(false)
  const lastCheck = useRef(0)

  const check = useCallback(async () => {
    if (Date.now() - lastCheck.current < CHECK_EVERY_MS) return
    lastCheck.current = Date.now()
    try {
      const result = await lookup(language)
      // Ajustes la ofrece aunque se dijera "Ahora no"; la ficha, solo si no.
      setAvailableUpdate(offeredUpdate(result, null))
      if (offeredUpdate(result, readDismissed())) setOpen(true)
    } catch {
      // Sin red: se mira la próxima vez.
      lastCheck.current = 0
    }
  }, [language])

  useEffect(() => {
    const timer = window.setTimeout(() => void check(), FIRST_CHECK_MS)
    const onVisible = () => {
      if (document.visibilityState === 'visible') void check()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.clearTimeout(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [check])

  if (!release) return null

  const later = () => {
    try {
      localStorage.setItem(DISMISSED_KEY, release.version)
    } catch {
      // Sin almacenamiento, volverá a salir: no pasa nada.
    }
    setOpen(false)
  }

  const footer = (
    <div className="update__actions">
      <a
        className="sheet__primary update__go"
        href={release.url}
        target="_blank"
        rel="noopener noreferrer"
        onClick={() => {
          haptic('success')
          setOpen(false)
        }}
      >
        {copy.update}
      </a>
      <button type="button" className="update__later" onClick={later}>
        {copy.later}
      </button>
    </div>
  )

  return (
    <Sheet open={open && !paused} onClose={later} title={copy.sheet} footer={footer}>
      <div className="update">
        <span className="update__seal" aria-hidden="true">
          {release.version}
        </span>
        <p className="update__kicker">{copy.kicker}</p>
        <h2 className="update__title">{copy.title(release.version)}</h2>
        <p className="update__lead">{copy.lead}</p>
        {release.notes.length > 0 && (
          <>
            <p className="sheet__title">{copy.news}</p>
            <ul className="update__notes">
              {release.notes.map((note) => (
                <li key={note}>{note}</li>
              ))}
            </ul>
          </>
        )}
      </div>
    </Sheet>
  )
}
