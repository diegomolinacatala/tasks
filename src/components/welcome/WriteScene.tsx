import { useEffect, useMemo, useState } from 'react'
import { suggestEmoji } from '../../lib/emoji'
import { parseTask } from '../../lib/parse'
import { parseRoutine } from '../../lib/repeat'
import { IconArrowUp, IconBell, IconPlus, IconRepeat } from '../ui/Icons'
import { reducedMotion } from './motion'
import '../compose/composer.css'
import '../routines/routines.css'
import '../task/task.css'

/** Una cita, un tramo con su duración y algo que se repite: lo que el compositor entiende solo. */
const PHRASES = ['Cena con Ana mañana a las 9 de la noche', 'Dentista el viernes de 17:30 a 18:30', 'Tomar creatina cada día a las 10'] as const

const TYPE_MS = 44
/** Con la frase entera, lo que se queda a la vista antes de añadirse. */
const HOLD_MS = 1100
const SHOWN = 3

interface Understood {
  title: string
  label: string
  emoji: string | null
  routine: boolean
}

/** Lo mismo que hace el compositor de verdad con lo escrito hasta ahora. */
function understand(text: string, now: number): Understood | null {
  if (!text.trim()) return null
  const routine = parseRoutine(text, now)
  if (routine) return { title: routine.title, label: routine.label, emoji: suggestEmoji(routine.title), routine: true }
  const task = parseTask(text, now, null)
  return task.label ? { title: task.title, label: task.label, emoji: null, routine: false } : null
}

type Row = Understood & { id: number }

/** Todas las frases ya añadidas, la última arriba: lo que se enseña cuando no se anima nada. */
const everything = (now: number): Row[] =>
  PHRASES.flatMap((phrase, id) => {
    const result = understand(phrase, now)
    return result ? [{ ...result, id }] : []
  }).reverse()

/**
 * La barra de escribir, escribiéndose sola: la frase va saliendo letra a letra y la píldora aparece en
 * el momento en que el analizador de la app la entiende. Al acabar, sube a la lista con su día y su
 * hora. Con el movimiento reducido se enseña el resultado, sin teclear.
 */
export function WriteScene() {
  const still = useMemo(reducedMotion, [])
  const [turn, setTurn] = useState(0)
  const [typed, setTyped] = useState(0)
  const [rows, setRows] = useState<Row[]>(() => (still ? everything(Date.now()) : []))
  const phrase = PHRASES[turn % PHRASES.length] ?? ''
  const text = still ? '' : phrase.slice(0, typed)
  const found = useMemo(() => understand(text, Date.now()), [text])

  useEffect(() => {
    if (still) return
    if (typed < phrase.length) {
      const timer = window.setTimeout(() => setTyped((count) => count + 1), TYPE_MS + ((typed * 13) % 34))
      return () => window.clearTimeout(timer)
    }
    const timer = window.setTimeout(() => {
      const result = understand(phrase, Date.now())
      if (result) setRows((current) => [{ ...result, id: turn }, ...current].slice(0, SHOWN))
      setTyped(0)
      setTurn((count) => count + 1)
    }, HOLD_MS)
    return () => window.clearTimeout(timer)
  }, [still, typed, phrase, turn])

  return (
    <div className="scene scene--write">
      <p className="sr-only">
        Por ejemplo, «{PHRASES[0]}» se apunta para mañana a las 21:00, y «{PHRASES[2]}» pasa a ser una rutina de cada día.
      </p>
      <ul className="scene__list" aria-hidden="true">
        {rows.map((row) => (
          <li key={row.id} className="scene__row">
            <span className="row__check" />
            <span className="scene__row-main">
              <span className="row__title">
                {row.emoji && <span className="emoji routine__emoji">{row.emoji}</span>}
                {row.title}
              </span>
              <span className="scene__meta">
                {row.routine ? <IconRepeat size={11} strokeWidth={2} /> : <IconBell size={11} strokeWidth={2} />}
                {row.label}
              </span>
            </span>
          </li>
        ))}
      </ul>
      <div className="composer is-active scene__composer" aria-hidden="true">
        <div className="composer__line">
          <span className="composer__mark">
            <IconPlus size={15} />
          </span>
          {/* Como el campo de verdad: si la frase no cabe, se ve el final, donde está el cursor. */}
          <span className="scene__typed">
            <span>
              {text || <span className="scene__placeholder">Añadir a hoy</span>}
              {!still && <i className="scene__caret" />}
            </span>
          </span>
          {text && (
            <span className="composer__send">
              <IconArrowUp size={17} strokeWidth={2.2} />
            </span>
          )}
        </div>
        <div className="composer__tray">
          {found ? (
            <span className={`composer__parsed ${found.routine ? 'is-routine' : ''}`}>
              {found.routine ? <IconRepeat size={12} strokeWidth={2} /> : <IconBell size={12} strokeWidth={2} />}
              {found.label}
            </span>
          ) : (
            ['Hoy', 'Mañana', 'Sin fecha'].map((label, index) => (
              <span key={label} className={`composer__target ${index === 0 ? 'is-active' : ''}`}>
                {label}
              </span>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
