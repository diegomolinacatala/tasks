import { useEffect, useMemo, useRef, useState } from 'react'
import { addLabel } from '../../lib/compose'
import { shortTime, todayIso } from '../../lib/date'
import { parseTask } from '../../lib/parse'
import { haptic } from '../../lib/platform/feedback'
import { useCopy } from '../../state/LanguageProvider'
import { IconBell, IconMic, IconPlus } from '../ui/Icons'
import { reducedMotion } from './motion'
import '../compose/composer.css'

const COPY = {
  es: {
    phrases: ['Café con David mañana a las 10', 'Regalo de Victor el sábado', 'Llamar a Miguel al moverme'],
    listening: 'Escuchando…',
    tap: 'Toca el micrófono',
    widget: 'Dictar en Tasks',
    label: 'La pantalla de bloqueo con el widget del micrófono: tocarlo abre Tasks escuchando y lo dicho se apunta solo.',
  },
  en: {
    phrases: ['Coffee with David tomorrow at 10', 'Gift for Victor on Saturday', 'Call Miguel when I move'],
    listening: 'Listening…',
    tap: 'Tap the microphone',
    widget: 'Dictate in Tasks',
    label: 'The Lock Screen with the microphone widget: tapping it opens Tasks listening and what you say is written down.',
  },
} as const

/** Lo que "escucha" antes de que salga la frase. */
const LISTEN_MS = 1500
const WORD_MS = 190
/** Con la frase entera, lo que se queda a la vista antes de añadirse a la lista. */
const HOLD_MS = 1300
const SHOWN = 2

type Phase = 'idle' | 'listening' | 'saying' | 'done'

interface Row {
  id: number
  title: string
  label: string
}

/**
 * Dictar desde la pantalla de bloqueo: el widget con el micrófono y, debajo, la app. Tocarlo (como en
 * el iPhone, donde abre Tasks ya escuchando) enciende la barra en modo escucha, la frase sale palabra
 * a palabra y el analizador de verdad la entiende. Al acabar sube a la lista y se puede volver a tocar
 * para la siguiente. Hasta el primer toque, el micrófono late. Con movimiento reducido se ve el resultado.
 */
export function DictateScene() {
  const copy = useCopy(COPY)
  const still = useMemo(reducedMotion, [])
  const today = useMemo(() => todayIso(), [])
  // La hora de la pantalla de bloqueo: la de ahora, como en el iPhone.
  const clock = useMemo(() => shortTime(`${String(new Date().getHours()).padStart(2, '0')}:${String(new Date().getMinutes()).padStart(2, '0')}`), [])
  const [phase, setPhase] = useState<Phase>('idle')
  const [turn, setTurn] = useState(0)
  const [words, setWords] = useState(0)
  const [rows, setRows] = useState<Row[]>(() => {
    if (!still) return []
    const phrase = copy.phrases[0] ?? ''
    const task = parseTask(phrase, Date.now(), [])
    return [{ id: -1, title: task.title, label: task.label ?? '' }]
  })
  const timer = useRef<number | undefined>(undefined)
  const phrase = copy.phrases[turn % copy.phrases.length] ?? ''
  const spoken = phrase.split(' ').slice(0, words).join(' ')
  const found = useMemo(() => (spoken ? parseTask(spoken, Date.now(), []) : null), [spoken])

  useEffect(() => () => window.clearTimeout(timer.current), [])

  useEffect(() => {
    if (phase === 'listening') {
      timer.current = window.setTimeout(() => setPhase('saying'), LISTEN_MS)
      return
    }
    if (phase === 'saying') {
      const total = phrase.split(' ').length
      if (words < total) {
        timer.current = window.setTimeout(() => setWords((count) => count + 1), WORD_MS + ((words * 11) % 90))
        return
      }
      timer.current = window.setTimeout(() => {
        const task = parseTask(phrase, Date.now(), [])
        setRows((current) => [{ id: turn, title: task.title, label: task.label ?? '' }, ...current].slice(0, SHOWN))
        setPhase('done')
        setWords(0)
        setTurn((count) => count + 1)
        haptic('success')
      }, HOLD_MS)
    }
  }, [phase, words, phrase, turn])

  const start = () => {
    if (phase === 'listening' || phase === 'saying') return
    haptic('selection')
    setPhase('listening')
  }

  const live = phase === 'listening' || phase === 'saying'

  return (
    <div className={`scene scene--dictate ${phase === 'idle' && !still ? 'is-hinting' : ''}`}>
      <p className="sr-only">{copy.label}</p>
      <div className="lock scene__lock">
        <p className="lock__date">{copy.widget}</p>
        <p className="scene__lock-clock" aria-hidden="true">
          {clock}
        </p>
        <div className="lock__widgets scene__lock-row">
          <button type="button" className={`lock__ring scene__mic ${live ? 'is-live' : ''}`} aria-label={copy.widget} onClick={start}>
            <IconMic size={22} strokeWidth={2.2} />
          </button>
          <span className="scene__mic-hint" aria-hidden="true">
            {phase === 'idle' ? copy.tap : ''}
          </span>
        </div>
      </div>
      <ul className="scene__list" aria-hidden="true">
        {rows.map((row) => (
          <li key={row.id} className="scene__row">
            <span className="row__check" />
            <span className="scene__row-main">
              <span className="row__title">{row.title}</span>
              {row.label && (
                <span className="scene__meta">
                  <IconBell size={11} strokeWidth={2} />
                  {row.label}
                </span>
              )}
            </span>
          </li>
        ))}
      </ul>
      <div className={`composer is-active scene__composer ${live ? 'is-listening' : ''}`} aria-hidden="true">
        <div className="composer__line">
          <span className="composer__mark">{live ? <IconMic size={15} /> : <IconPlus size={15} />}</span>
          <span className="scene__typed">
            <span>
              {phase === 'listening' ? (
                <span className="scene__listening">
                  <span className="scene__voice">
                    <i />
                    <i />
                    <i />
                    <i />
                    <i />
                  </span>
                  {copy.listening}
                </span>
              ) : (
                spoken || <span className="scene__placeholder">{addLabel(today, today)}</span>
              )}
            </span>
          </span>
        </div>
        <div className="composer__foot">
          <div className="composer__tray">
            {found?.label && (
              <span className="composer__parsed">
                <IconBell size={12} strokeWidth={2} />
                {found.label}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
