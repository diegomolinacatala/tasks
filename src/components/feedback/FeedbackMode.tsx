import { useCallback, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import type { FeedbackReport } from '../../lib/feedback'
import { describeElements, deviceLabel, postFeedback } from '../../lib/feedback'
import { language } from '../../lib/i18n'
import { isNative } from '../../lib/platform'
import { haptic } from '../../lib/platform/feedback'
import { captureScreen } from '../../lib/platform/screenshot'
import { currentTheme } from '../../lib/theme'
import { useCopy } from '../../state/LanguageProvider'
import type { TabId } from '../../types'
import { IconClose, IconFeather } from '../ui/Icons'
import { useToast } from '../ui/Toast'
import { composeShot } from './composeShot'
import { FEEDBACK_ROOT } from './describe'
import type { Mark } from './FeedbackDraw'
import { FeedbackDraw } from './FeedbackDraw'
import { FeedbackSheet } from './FeedbackSheet'
import './feedback.css'

/** Para quien lee el buzón (en español), sea cual sea el idioma de la app. */
const SCREENS: Record<TabId, string> = { inbox: 'Bandeja', agenda: 'Agenda', places: 'Lugares', settings: 'Ajustes' }

const COPY = {
  es: {
    pill: 'Rodea lo que quieras comentar',
    leave: 'Salir de las sugerencias',
    sent: 'Enviada. ¡Gracias!',
    screens: SCREENS,
  },
  en: {
    pill: 'Circle what you want to comment on',
    leave: 'Stop suggesting',
    sent: 'Sent. Thank you!',
    screens: { inbox: 'Inbox', agenda: 'Agenda', places: 'Places', settings: 'Settings' } as Record<TabId, string>,
  },
} as const

/**
 * `browse`: la app sigue usándose, con una píldora arriba para ir a lo que se quiera comentar.
 * `capturing`: un instante sin la píldora, para que no salga en la foto. `draw`: se rodea.
 * `write`: el mensaje.
 */
type Phase = 'browse' | 'capturing' | 'draw' | 'write'

interface FeedbackModeProps {
  tab: TabId
  /** Dirección del Worker, donde está el buzón. */
  api: string
  onDone: () => void
}

const nextFrame = () => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))

const inkColor = () => getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#8a5a2c'

/** Modo sugerencia: ir a cualquier sitio de la app, rodearlo con el dedo y escribir qué cambiarías. */
export function FeedbackMode({ tab, api, onDone }: FeedbackModeProps) {
  const copy = useCopy(COPY)
  const toast = useToast()
  const [phase, setPhase] = useState<Phase>('browse')
  const [shot, setShot] = useState<string | null>(null)
  const [mark, setMark] = useState<Mark | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  // La foto con el trazo no se pudo hacer: se envía sin foto (y sin textos), como si se hubiera quitado.
  const [composeFailed, setComposeFailed] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [withShot, setWithShot] = useState(true)
  const [message, setMessage] = useState('')
  const [sending, setSending] = useState(false)
  const [version, setVersion] = useState('web')
  // La pestaña en que se rodeó: mientras se escribe ya no cambia.
  const [screen, setScreen] = useState(tab)

  useEffect(() => {
    if (!isNative) return
    void import('@capacitor/app')
      .then(({ App }) => App.getInfo())
      .then((info) => setVersion(`${info.version} (${info.build})`))
      .catch(() => undefined)
  }, [])

  // La foto con el trazo, en cuanto hay algo rodeado: así el panel la enseña tal como se enviará.
  useEffect(() => {
    setPreview(null)
    setComposeFailed(false)
    if (!shot || !mark) return
    let alive = true
    composeShot(shot, mark.path, { width: window.innerWidth, height: window.innerHeight }, inkColor())
      .then((data) => {
        if (!alive) return
        setPreview(data)
        setComposeFailed(data === null)
      })
      .catch(() => alive && setComposeFailed(true))
    return () => {
      alive = false
    }
  }, [shot, mark])

  const capture = async () => {
    setPhase('capturing')
    setScreen(tab)
    await nextFrame()
    const image = await captureScreen()
    haptic('tap')
    setShot(image)
    setMark(null)
    setPhase('draw')
  }

  const onMark = useCallback((next: Mark) => {
    setMark(next)
    setPhase('write')
  }, [])

  const skip = useCallback(() => {
    setMark({ path: '', region: null, elements: [], sheet: null })
    setPhase('write')
  }, [])

  const backToBrowse = useCallback(() => {
    setPhase('browse')
    setShot(null)
    setMark(null)
  }, [])

  const hasShot = shot !== null && !composeFailed
  const attached = hasShot && withShot ? preview : null

  const send = async () => {
    if (!mark) return
    const report: FeedbackReport = {
      message,
      shot: attached,
      context: {
        screen: SCREENS[screen],
        // Sin la captura (quitada, o en la web, que no la tiene) no van textos: el título del panel o lo
        // rodeado son las tareas de quien escribe. Solo dónde está.
        sheet: attached ? mark.sheet : null,
        region: mark.region,
        viewport: { width: window.innerWidth, height: window.innerHeight },
        elements: describeElements(mark.elements, attached !== null),
        app: { version, platform: isNative ? 'ios' : 'web', language: language(), theme: currentTheme() },
        device: deviceLabel(navigator.userAgent),
      },
    }
    setSending(true)
    setError(null)
    try {
      await postFeedback(api, report)
      haptic('success')
      toast({ message: copy.sent })
      onDone()
    } catch (failure) {
      setSending(false)
      setError(failure instanceof Error ? failure.message : String(failure))
    }
  }

  const picked = mark?.elements.find((info) => info.label)?.label ?? (mark?.region ? (mark.elements[0]?.path ?? null) : null)
  const where = [copy.screens[screen], mark?.sheet].filter(Boolean).join(' · ')

  return createPortal(
    <div className={FEEDBACK_ROOT}>
      {phase === 'browse' && (
        <div className="fb-pill">
          <button type="button" className="fb-pill__go" onClick={() => void capture()}>
            <IconFeather size={17} />
            <span>{copy.pill}</span>
          </button>
          <button type="button" className="fb-pill__close" aria-label={copy.leave} onClick={onDone}>
            <IconClose size={16} />
          </button>
        </div>
      )}
      {(phase === 'draw' || phase === 'write') && (
        <FeedbackDraw
          shot={shot}
          mark={mark}
          live={phase === 'draw'}
          onStart={() => setMark(null)}
          onMark={onMark}
          onSkip={skip}
          onCancel={backToBrowse}
        />
      )}
      <FeedbackSheet
        open={phase === 'write'}
        preview={preview}
        hasShot={hasShot}
        withShot={withShot}
        where={where}
        picked={picked}
        message={message}
        sending={sending}
        waiting={hasShot && withShot && preview === null}
        error={error}
        onMessage={(next) => {
          setMessage(next)
          setError(null)
        }}
        onToggleShot={() => setWithShot((on) => !on)}
        onRedraw={() => setPhase('draw')}
        onClose={backToBrowse}
        onSend={() => void send()}
      />
    </div>,
    document.body,
  )
}
